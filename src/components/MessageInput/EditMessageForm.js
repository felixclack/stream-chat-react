// @ts-check
import React, { useContext, useEffect } from 'react';
import PropTypes from 'prop-types';
import { FileUploadButton, ImageDropzone } from 'react-file-utils';
import { Tooltip } from '../Tooltip';

import { ChannelContext, TranslationContext } from '../../context';
import { ChatAutoComplete } from '../ChatAutoComplete';
import useMessageInput from './hooks/messageInput';
import UploadsPreview from './UploadsPreview';
import EmojiPicker from './EmojiPicker';
import {
  EmojiIconSmall as DefaultEmojiIcon,
  FileUploadIcon as DefaultFileUploadIcon,
} from './icons';
import { KEY_CODES } from '../AutoCompleteTextarea';

/** @type {React.FC<import("types").MessageInputProps>} */
const EditMessageForm = (props) => {
  const {
    clearEditingState,
    EmojiIcon = DefaultEmojiIcon,
    FileUploadIcon = DefaultFileUploadIcon,
  } = props;

  const channelContext = useContext(ChannelContext);
  const { t } = useContext(TranslationContext);

  const messageInput = useMessageInput(props);

  useEffect(() => {
    /** @type {(event: KeyboardEvent) => void} Typescript syntax */
    const onKeyDown = (event) => {
      if (event.keyCode === KEY_CODES.ESC && clearEditingState)
        clearEditingState();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [clearEditingState]);

  return (
    <div className='str-chat__edit-message-form'>
      <ImageDropzone
        accept={channelContext.acceptedFiles}
        disabled={
          !messageInput.isUploadEnabled || messageInput.maxFilesLeft === 0
        }
        handleFiles={messageInput.uploadNewFiles}
        maxNumberOfFiles={messageInput.maxFilesLeft}
        multiple={channelContext.multipleUploads}
      >
        <form onSubmit={messageInput.handleSubmit}>
          {messageInput.isUploadEnabled && <UploadsPreview {...messageInput} />}
          <EmojiPicker {...messageInput} small />
          <ChatAutoComplete
            additionalTextareaProps={props.additionalTextareaProps}
            commands={messageInput.getCommands()}
            grow={props.grow}
            handleSubmit={messageInput.handleSubmit}
            innerRef={messageInput.textareaRef}
            maxRows={props.maxRows}
            onChange={messageInput.handleChange}
            onPaste={messageInput.onPaste}
            onSelectItem={messageInput.onSelectItem}
            placeholder={t('Type your message')}
            rows={1}
            value={messageInput.text}
          />
          <div className='str-chat__message-team-form-footer'>
            <div className='str-chat__edit-message-form-options'>
              <span
                className='str-chat__input-emojiselect'
                onClick={messageInput.openEmojiPicker}
              >
                <EmojiIcon />
              </span>
              {messageInput.isUploadEnabled && (
                <div
                  className='str-chat__fileupload-wrapper'
                  data-testid='fileinput'
                >
                  <Tooltip>
                    {messageInput.maxFilesLeft
                      ? t('Attach files')
                      : t("You've reached the maximum number of files")}
                  </Tooltip>
                  <FileUploadButton
                    accepts={channelContext.acceptedFiles}
                    disabled={messageInput.maxFilesLeft === 0}
                    handleFiles={messageInput.uploadNewFiles}
                    multiple={channelContext.multipleUploads}
                  >
                    <span className='str-chat__input-fileupload'>
                      <FileUploadIcon />
                    </span>
                  </FileUploadButton>
                </div>
              )}
            </div>
            <div>
              <button
                onClick={() => {
                  if (props.clearEditingState) {
                    props.clearEditingState();
                  }
                }}
              >
                {t('Cancel')}
              </button>
              <button type='submit'>{t('Send')}</button>
            </div>
          </div>
        </form>
      </ImageDropzone>
    </div>
  );
};

EditMessageForm.propTypes = {
  /**
   * Any additional attributes that you may want to add for underlying HTML textarea element.
   */
  additionalTextareaProps: PropTypes.object,
  /**
   * Clears edit state for current message (passed down from message component)
   */
  clearEditingState: PropTypes.func,
  /** Make the textarea disabled */
  disabled: PropTypes.bool,
  /** Override file upload request */
  doFileUploadRequest: PropTypes.func,
  /** Override image upload request */
  doImageUploadRequest: PropTypes.func,
  /**
   * Custom UI component for emoji button in input.
   *
   * Defaults to and accepts same props as: [EmojiIconSmall](https://github.com/GetStream/stream-chat-react/blob/master/src/components/MessageInput/icons.js)
   * */
  EmojiIcon: /** @type {PropTypes.Validator<React.FC>} */ (PropTypes.elementType),
  /**
   * Custom UI component for file upload button in input.
   *
   * Defaults to and accepts same props as: [FileUploadIcon](https://github.com/GetStream/stream-chat-react/blob/master/src/components/MessageInput/icons.js)
   * */
  FileUploadIcon: /** @type {PropTypes.Validator<React.FC>} */ (PropTypes.elementType),
  /** Set focus to the text input if this is enabled */
  focus: PropTypes.bool.isRequired,
  /** Grow the textarea while you're typing */
  grow: PropTypes.bool.isRequired,
  /** Specify the max amount of rows the textarea is able to grow */
  maxRows: PropTypes.number.isRequired,
  /**
   * @param message: the Message object to be sent
   * @param cid: the channel id
   */
  overrideSubmitHandler: PropTypes.func,
  /** enable/disable firing the typing event */
  publishTypingEvent: PropTypes.bool,
  /**
   * Custom UI component for send button.
   *
   * Defaults to and accepts same props as: [SendButton](https://getstream.github.io/stream-chat-react/#sendbutton)
   * */
  SendButton: /** @type {PropTypes.Validator<React.FC<import('types').SendButtonProps>>} */ (PropTypes.elementType),
};

EditMessageForm.defaultProps = {
  additionalTextareaProps: {},
  disabled: false,
  focus: false,
  grow: true,
  maxRows: 10,
  publishTypingEvent: true,
};

export default EditMessageForm;
