import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import { logChatPromiseExecution } from 'stream-chat';
import {
  dataTransferItemsHaveFiles,
  dataTransferItemsToFiles,
} from 'react-file-utils';
import { ChannelContext } from '../../../context/ChannelContext';
import { generateRandomId } from '../../../utils';

/**
 * @typedef {import("types").MessageInputState} State
 * @typedef {import("types").MessageInputProps} Props
 * @typedef {import('stream-chat').Unpacked<ReturnType<import("types").StreamChatReactClient['sendFile']>>} FileUploadAPIResponse
 * @typedef {import('stream-chat').UserResponse} UserResponse
 */

/**
 * Get attachment type from MIME type
 * @param {string} mime
 * @returns {string}
 */
const getAttachmentTypeFromMime = (mime) => {
  if (mime.includes('video/')) return 'media';
  if (mime.includes('audio/')) return 'audio';
  return 'file';
};

/** @type {{ [id: string]: import('types').FileUpload }} */
const emptyFileUploads = {};
/** @type {{ [id: string]: import('types').ImageUpload }} */
const emptyImageUploads = {};

const apiMaxNumberOfFiles = 10;

/**
 * Initializes the state. Empty if the message prop is falsy.
 * @param {import("stream-chat").MessageResponse | undefined} message
 * @returns {State}
 */
function initState(message) {
  if (!message) {
    return {
      attachments: [],
      emojiPickerIsOpen: false,
      fileOrder: [],
      fileUploads: { ...emptyFileUploads },
      imageOrder: [],
      imageUploads: { ...emptyImageUploads },
      mentioned_users: [],
      numberOfUploads: 0,
      text: '',
    };
  }

  // if message prop is defined, get image uploads, file uploads, text, etc. from it
  const imageUploads =
    message.attachments
      ?.filter(({ type }) => type === 'image')
      .reduce((acc, attachment) => {
        const id = generateRandomId();
        acc[id] = {
          file: {
            name: attachment.fallback,
          },
          id,
          state: 'finished',
          url: attachment.image_url,
        };
        return acc;
      }, {}) || {};
  const imageOrder = Object.keys(imageUploads);

  const fileUploads =
    message.attachments
      ?.filter(({ type }) => type === 'file')
      .reduce((acc, attachment) => {
        const id = generateRandomId();
        acc[id] = {
          file: {
            name: attachment.title,
            size: attachment.file_size,
            type: attachment.mime_type,
          },
          id,
          state: 'finished',
          url: attachment.asset_url,
        };
        return acc;
      }, {}) || {};
  const fileOrder = Object.keys(fileUploads);

  const numberOfUploads = fileOrder.length + imageOrder.length;

  const attachments =
    message.attachments?.filter(
      ({ type }) => type !== 'file' && type !== 'image',
    ) || [];

  const mentioned_users = message.mentioned_users || [];

  return {
    attachments,
    emojiPickerIsOpen: false,
    fileOrder,
    fileUploads,
    imageOrder,
    imageUploads,
    mentioned_users,
    numberOfUploads,
    text: message.text || '',
  };
}
/**
 * MessageInput state reducer
 * @param {State} state
 * @param {import("./types").MessageInputReducerAction} action
 * @returns {State}
 */
function messageInputReducer(state, action) {
  switch (action.type) {
    case 'setEmojiPickerIsOpen':
      return { ...state, emojiPickerIsOpen: action.value };
    case 'setText':
      return { ...state, text: action.getNewText(state.text) };
    case 'clear':
      return {
        attachments: [],
        emojiPickerIsOpen: false,
        fileOrder: [],
        fileUploads: { ...emptyFileUploads },
        imageOrder: [],
        imageUploads: { ...emptyImageUploads },
        mentioned_users: [],
        numberOfUploads: 0,
        text: '',
      };
    case 'setImageUpload': {
      const imageAlreadyExists = state.imageUploads[action.id];
      if (!imageAlreadyExists && !action.file) return state;
      const imageOrder = imageAlreadyExists
        ? state.imageOrder
        : state.imageOrder.concat(action.id);
      const { type, ...newUploadFields } = action;
      return {
        ...state,
        imageOrder,
        imageUploads: {
          ...state.imageUploads,
          [action.id]: { ...state.imageUploads[action.id], ...newUploadFields },
        },
        numberOfUploads: imageAlreadyExists
          ? state.numberOfUploads
          : state.numberOfUploads + 1,
      };
    }
    case 'setFileUpload': {
      const fileAlreadyExists = state.fileUploads[action.id];
      if (!fileAlreadyExists && !action.file) return state;
      const fileOrder = fileAlreadyExists
        ? state.fileOrder
        : state.fileOrder.concat(action.id);
      const { type, ...newUploadFields } = action;
      return {
        ...state,
        fileOrder,
        fileUploads: {
          ...state.fileUploads,
          [action.id]: { ...state.fileUploads[action.id], ...newUploadFields },
        },
        numberOfUploads: fileAlreadyExists
          ? state.numberOfUploads
          : state.numberOfUploads + 1,
      };
    }
    case 'removeImageUpload': {
      if (!state.imageUploads[action.id]) return state; // cannot remove anything
      const newImageUploads = { ...state.imageUploads };
      delete newImageUploads[action.id];
      return {
        ...state,
        imageOrder: state.imageOrder.filter((_id) => _id !== action.id),
        imageUploads: newImageUploads,
        numberOfUploads: state.numberOfUploads - 1,
      };
    }
    case 'removeFileUpload': {
      if (!state.fileUploads[action.id]) return state; // cannot remove anything
      const newFileUploads = { ...state.fileUploads };
      delete newFileUploads[action.id];
      return {
        ...state,
        fileOrder: state.fileOrder.filter((_id) => _id !== action.id),
        fileUploads: newFileUploads,
        numberOfUploads: state.numberOfUploads - 1,
      };
    }
    case 'reduceNumberOfUploads': // TODO: figure out if we can just use uploadOrder instead
      return { ...state, numberOfUploads: state.numberOfUploads - 1 };
    case 'addMentionedUser':
      return {
        ...state,
        mentioned_users: state.mentioned_users.concat(action.user),
      };
    default:
      return state;
  }
}
/**
 * hook for MessageInput state
 * @type{import('types').useMessageInput}
 */
export default function useMessageInput(props) {
  const {
    additionalTextareaProps,
    clearEditingState,
    doFileUploadRequest,
    doImageUploadRequest,
    errorHandler,
    focus,
    message,
    noFiles,
    overrideSubmitHandler,
    parent,
    publishTypingEvent,
  } = props;

  const {
    channel,
    editMessage,
    maxNumberOfFiles,
    multipleUploads,
    sendMessage,
  } = useContext(ChannelContext);

  const [state, dispatch] = useReducer(messageInputReducer, message, initState);

  const {
    attachments,
    fileOrder,
    fileUploads,
    imageOrder,
    imageUploads,
    mentioned_users,
    numberOfUploads,
    text,
  } = state;

  const textareaRef = useRef(
    /** @type {HTMLTextAreaElement | undefined} */ (undefined),
  );
  const emojiPickerRef = useRef(/** @type {HTMLDivElement | null} */ (null));

  // Focus
  useEffect(() => {
    if (focus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [focus]);

  // Text + cursor position
  const newCursorPosition = useRef(/** @type {number | null} */ (null));

  const insertText = useCallback(
    (textToInsert) => {
      const { maxLength } = additionalTextareaProps;

      if (!textareaRef.current) {
        dispatch({
          getNewText: (t) => {
            const updatedText = t + textToInsert;
            if (updatedText.length > maxLength) {
              return updatedText.slice(0, maxLength);
            }
            return updatedText;
          },
          type: 'setText',
        });
        return;
      }

      const { selectionEnd, selectionStart } = textareaRef.current;
      newCursorPosition.current = selectionStart + textToInsert.length;

      dispatch({
        getNewText: (prevText) => {
          const updatedText =
            prevText.slice(0, selectionStart) +
            textToInsert +
            prevText.slice(selectionEnd);

          if (updatedText.length > maxLength) {
            return updatedText.slice(0, maxLength);
          }

          return updatedText;
        },
        type: 'setText',
      });
    },
    [additionalTextareaProps, newCursorPosition, textareaRef],
  );

  useEffect(() => {
    const textareaElement = textareaRef.current;
    if (textareaElement && newCursorPosition.current !== null) {
      textareaElement.selectionStart = newCursorPosition.current;
      textareaElement.selectionEnd = newCursorPosition.current;
      newCursorPosition.current = null;
    }
  }, [text, newCursorPosition]);

  const handleChange = useCallback(
    (event) => {
      event.preventDefault();
      if (!event || !event.target) {
        return;
      }

      const newText = event.target.value;
      dispatch({
        getNewText: () => newText,
        type: 'setText',
      });
      if (publishTypingEvent && newText && channel) {
        logChatPromiseExecution(
          channel.keystroke(parent?.id),
          'start typing event',
        );
      }
    },
    [channel, parent, publishTypingEvent],
  );

  // Emoji

  const closeEmojiPicker = useCallback(
    (e) => {
      if (
        emojiPickerRef.current &&
        !emojiPickerRef.current.contains(e.target)
      ) {
        dispatch({
          type: 'setEmojiPickerIsOpen',
          value: false,
        });
      }
    },
    [emojiPickerRef],
  );

  const openEmojiPicker = useCallback((event) => {
    dispatch({
      type: 'setEmojiPickerIsOpen',
      value: true,
    });

    // Prevent event from bubbling to document, so the close handler is never called for this event
    event.stopPropagation();
  }, []);

  const handleEmojiKeyDown = (event) => {
    if (
      event.key === ' ' ||
      event.key === 'Enter' ||
      event.key === 'Spacebar'
    ) {
      event.preventDefault();
      openEmojiPicker(event);
    }
  };

  const handleEmojiEscape = (event) => {
    if (event.key === 'Escape') {
      dispatch({
        type: 'setEmojiPickerIsOpen',
        value: false,
      });
    }
  };

  useEffect(() => {
    if (state.emojiPickerIsOpen) {
      document.addEventListener('click', closeEmojiPicker, false);
      document.addEventListener('keydown', handleEmojiEscape);
    }
    return () => {
      document.removeEventListener('click', closeEmojiPicker, false);
      document.removeEventListener('keydown', handleEmojiEscape);
    };
  }, [closeEmojiPicker, state.emojiPickerIsOpen]);

  const onSelectEmoji = useCallback((emoji) => insertText(emoji.native), [
    insertText,
  ]);

  // Commands / mentions

  const getCommands = useCallback(() => channel?.getConfig()?.commands, [
    channel,
  ]);

  const getUsers = useCallback(() => {
    if (!channel) return [];
    return [
      ...Object.values(channel.state.members).map(({ user }) => user),
      ...Object.values(channel.state.watchers),
    ].filter(
      (_user, index, self) =>
        self.findIndex((user) => user?.id === _user?.id) === index, // filter out non-unique ids
    );
  }, [channel]);

  const onSelectItem = useCallback(
    /** @param {UserResponse} item */
    (item) => {
      dispatch({ type: 'addMentionedUser', user: item });
    },
    [],
  );

  // Submitting

  const getAttachmentsFromUploads = useCallback(() => {
    const imageAttachments = imageOrder
      .map((id) => imageUploads[id])
      .filter((upload) => upload.state !== 'failed')
      .filter((
        { id, url },
        index,
        self, // filter out duplicates based on url
      ) => self.every((upload) => upload.id === id || upload.url !== url))
      .map((upload) => ({
        fallback: upload.file.name,
        image_url: upload.url,
        type: 'image',
      }));

    const fileAttachments = fileOrder
      .map((id) => fileUploads[id])
      .filter((upload) => upload.state !== 'failed')
      .map((upload) => ({
        asset_url: upload.url,
        file_size: upload.file.size,
        mime_type: upload.file.type,
        title: upload.file.name,
        type: getAttachmentTypeFromMime(upload.file.type),
      }));

    return [
      ...attachments, // from state
      ...imageAttachments,
      ...fileAttachments,
    ];
  }, [imageOrder, imageUploads, fileOrder, fileUploads, attachments]);

  /**
   * @param {React.FormEvent | React.MouseEvent} event
   */
  const handleSubmit = (event) => {
    event.preventDefault();
    const trimmedMessage = text.trim();
    const isEmptyMessage =
      trimmedMessage === '' ||
      trimmedMessage === '>' ||
      trimmedMessage === '``````' ||
      trimmedMessage === '``' ||
      trimmedMessage === '**' ||
      trimmedMessage === '____' ||
      trimmedMessage === '__' ||
      trimmedMessage === '****';
    if (isEmptyMessage && numberOfUploads === 0) {
      return;
    }
    // the channel component handles the actual sending of the message
    const someAttachmentsUploading =
      Object.values(imageUploads).some(
        (upload) => upload.state === 'uploading',
      ) ||
      Object.values(fileUploads).some((upload) => upload.state === 'uploading');
    if (someAttachmentsUploading) {
      // TODO: show error to user that they should wait until image is uploaded
      return;
    }

    const newAttachments = getAttachmentsFromUploads();

    // Instead of checking if a user is still mentioned every time the text changes,
    // just filter out non-mentioned users before submit, which is cheaper
    // and allows users to easily undo any accidental deletion
    const actualMentionedUsers = Array.from(
      new Set(
        mentioned_users
          .filter(
            ({ id, name }) =>
              text.includes(`@${id}`) || text.includes(`@${name}`),
          )
          .map(({ id }) => id),
      ),
    );

    const updatedMessage = {
      attachments: newAttachments,
      mentioned_users: actualMentionedUsers,
      text,
    };

    if (!!message && editMessage) {
      // TODO: Remove this line and show an error when submit fails
      if (clearEditingState) clearEditingState();

      const updateMessagePromise = editMessage({
        ...updatedMessage,
        id: message.id,
      }).then(clearEditingState);

      logChatPromiseExecution(updateMessagePromise, 'update message');
      dispatch({ type: 'clear' });
    } else if (
      overrideSubmitHandler &&
      typeof overrideSubmitHandler === 'function' &&
      channel
    ) {
      overrideSubmitHandler(
        {
          ...updatedMessage,
          parent,
        },
        channel.cid,
      );
      dispatch({ type: 'clear' });
    } else if (sendMessage) {
      const sendMessagePromise = sendMessage({
        ...updatedMessage,
        parent,
      });
      logChatPromiseExecution(sendMessagePromise, 'send message');
      dispatch({ type: 'clear' });
    }
    if (channel && publishTypingEvent)
      logChatPromiseExecution(channel.stopTyping(), 'stop typing');
  };

  // Attachments

  // Files

  const uploadFile = useCallback((id) => {
    dispatch({ id, state: 'uploading', type: 'setFileUpload' });
  }, []);

  const removeFile = useCallback((id) => {
    // TODO: cancel upload if still uploading
    dispatch({ id, type: 'removeFileUpload' });
  }, []);

  useEffect(() => {
    (async () => {
      if (!channel) return;
      const upload = Object.values(fileUploads).find(
        (fileUpload) => fileUpload.state === 'uploading' && fileUpload.file,
      );
      if (!upload) return;

      const { file, id } = upload;
      /** @type FileUploadAPIResponse */
      let response;
      try {
        if (doFileUploadRequest) {
          response = await doFileUploadRequest(file, channel);
        } else {
          response = await channel.sendFile(file);
        }
      } catch (e) {
        console.warn(e);
        let alreadyRemoved = false;

        dispatch({ type: 'reduceNumberOfUploads' });
        if (!fileUploads[id]) {
          alreadyRemoved = true;
        } else {
          dispatch({ id, state: 'failed', type: 'setFileUpload' });
        }
        if (!alreadyRemoved && errorHandler) {
          // TODO: verify if the parameters passed to the error handler actually make sense
          errorHandler(e, 'upload-file', file);
        }
        return;
      }

      // If doImageUploadRequest returns any falsy value, then don't create the upload preview.
      // This is for the case if someone wants to handle failure on app level.
      if (!response) {
        removeFile(id);
        return;
      }

      dispatch({
        id,
        state: 'finished',
        type: 'setFileUpload',
        url: response.file,
      });
    })();
  }, [fileUploads, channel, doFileUploadRequest, errorHandler, removeFile]);

  // Images

  const removeImage = useCallback((id) => {
    dispatch({ id, type: 'removeImageUpload' });
    // TODO: cancel upload if still uploading
  }, []);

  const uploadImage = useCallback(
    async (id) => {
      const img = imageUploads[id];
      if (!img || !channel) return;
      const { file } = img;
      if (img.state !== 'uploading') {
        dispatch({ id, state: 'uploading', type: 'setImageUpload' });
      }
      /** @type FileUploadAPIResponse */
      let response;
      try {
        if (doImageUploadRequest) {
          response = await doImageUploadRequest(file, channel);
        } else {
          response = await channel.sendImage(file);
        }
      } catch (e) {
        console.warn(e);
        let alreadyRemoved = false;
        dispatch({ type: 'reduceNumberOfUploads' });
        if (!imageUploads[id]) {
          alreadyRemoved = true;
        } else {
          dispatch({ id, state: 'failed', type: 'setImageUpload' });
        }
        if (!alreadyRemoved && errorHandler) {
          // TODO: verify if the parameters passed to the error handler actually make sense
          errorHandler(e, 'upload-image', {
            file,
            id,
          });
        }
        return;
      }

      // If doImageUploadRequest returns any falsy value, then don't create the upload preview.
      // This is for the case if someone wants to handle failure on app level.
      if (!response) {
        removeImage(id);
        return;
      }

      dispatch({
        id,
        state: 'finished',
        type: 'setImageUpload',
        url: response.file,
      });
    },
    [imageUploads, channel, doImageUploadRequest, errorHandler, removeImage],
  );

  useEffect(() => {
    if (FileReader) {
      const upload = Object.values(imageUploads).find(
        (imageUpload) =>
          imageUpload.state === 'uploading' &&
          !!imageUpload.file &&
          !imageUpload.previewUri,
      );
      if (upload) {
        const { file, id } = upload;
        // TODO: Possibly use URL.createObjectURL instead. However, then we need
        // to release the previews when not used anymore though.
        const reader = new FileReader();
        reader.onload = (event) => {
          if (typeof event.target?.result !== 'string') return;
          dispatch({
            id,
            previewUri: event.target.result,
            type: 'setImageUpload',
          });
        };
        reader.readAsDataURL(file);
        uploadImage(id);
        return () => {
          reader.onload = null;
        };
      }
    }
    return () => {};
  }, [imageUploads, uploadImage]);

  // Number of files that the user can still add. Should never be more than the amount allowed by the API.
  // If multipleUploads is false, we only want to allow a single upload.
  const maxFilesAllowed = useMemo(
    () => (!multipleUploads ? 1 : maxNumberOfFiles || apiMaxNumberOfFiles),
    [maxNumberOfFiles, multipleUploads],
  );

  // return !multipleUploads ? 1 : maxNumberOfFiles || apiMaxNumberOfFiles;
  const maxFilesLeft = maxFilesAllowed - numberOfUploads;

  const uploadNewFiles = useCallback(
    /**
     * @param {File[]} files
     */
    (files) => {
      Array.from(files)
        .slice(0, maxFilesLeft)
        .forEach((file) => {
          const id = generateRandomId();
          if (
            file.type.startsWith('image/') &&
            !file.type.endsWith('.photoshop') // photoshop files begin with 'image/'
          ) {
            dispatch({ file, id, state: 'uploading', type: 'setImageUpload' });
          } else if (file instanceof File && !noFiles) {
            dispatch({ file, id, state: 'uploading', type: 'setFileUpload' });
          }
        });
    },
    [maxFilesLeft, noFiles],
  );

  const onPaste = useCallback(
    /** (e: React.ClipboardEvent) */
    (e) => {
      (async (event) => {
        // TODO: Move this handler to package with ImageDropzone
        const { items } = event.clipboardData;
        if (!dataTransferItemsHaveFiles(items)) return;

        event.preventDefault();
        // Get a promise for the plain text in case no files are
        // found. This needs to be done here because chrome cleans
        // up the DataTransferItems after resolving of a promise.
        let plainTextPromise;
        /** @type {DataTransferItem} */
        const plainTextItem = [...items].find(
          ({ kind, type }) => kind === 'string' && type === 'text/plain',
        );

        if (plainTextItem) {
          plainTextPromise = new Promise((resolve) => {
            plainTextItem.getAsString((string) => {
              resolve(string);
            });
          });
        }

        const fileLikes = await dataTransferItemsToFiles(items);
        if (fileLikes.length) {
          uploadNewFiles(fileLikes);
          return;
        }

        // fallback to regular text paste
        if (plainTextPromise) {
          const pastedText = await plainTextPromise;
          insertText(pastedText);
        }
      })(e);
    },
    [insertText, uploadNewFiles],
  );

  const isUploadEnabled = channel?.getConfig?.()?.uploads !== false;

  return {
    ...state,
    closeEmojiPicker,
    emojiPickerRef,
    getCommands,
    getUsers,
    handleChange,
    handleEmojiKeyDown,
    handleSubmit,
    isUploadEnabled,
    maxFilesLeft,
    onPaste,
    onSelectEmoji,
    onSelectItem,
    openEmojiPicker,
    removeFile,
    removeImage,
    textareaRef,
    uploadFile,
    uploadImage,
    uploadNewFiles,
  };
}
