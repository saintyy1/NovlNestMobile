import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

export interface ChatMessage {
  id: string;
  sender: string;
  content: string;
}

interface InlineChatEditorProps {
  onAddChat: (messages: ChatMessage[]) => void;
}

export const InlineChatEditor: React.FC<InlineChatEditorProps> = ({ onAddChat }) => {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newSender, setNewSender] = useState('');
  const [newContent, setNewContent] = useState('');

  const styles = getStyles(colors);

  const addMessage = () => {
    if (!newSender.trim() || !newContent.trim()) {
      Alert.alert('Error', 'Please fill in both sender name and message content');
      return;
    }

    const message: ChatMessage = {
      id: Date.now().toString(),
      sender: newSender.trim(),
      content: newContent.trim(),
    };

    setMessages([...messages, message]);
    setNewContent('');
  };

  const deleteMessage = (id: string) => {
    setMessages(messages.filter((msg) => msg.id !== id));
  };

  const insertChat = () => {
    if (messages.length === 0) {
      Alert.alert('Error', 'Please add at least one message');
      return;
    }
    onAddChat(messages);
    cancelChat();
  };

  const cancelChat = () => {
    setMessages([]);
    setNewSender('');
    setNewContent('');
    setIsOpen(false);
  };

  if (!isOpen) {
    return (
      <TouchableOpacity
        style={styles.openButton}
        onPress={() => setIsOpen(true)}
        activeOpacity={0.7}
      >
        <Ionicons name="chatbubbles" size={16} color="#fff" style={styles.buttonIcon} />
        <Text style={styles.openButtonText}>Add Chat</Text>
      </TouchableOpacity>
    );
  }

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="fade"
      onRequestClose={cancelChat}
    >
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Add Chat Messages</Text>
              <TouchableOpacity
                onPress={cancelChat}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Content */}
            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
              {/* Add Message Form */}
              <View style={styles.formSection}>
                <Text style={styles.sectionTitle}>
                  {newSender.trim() ? `Adding messages for: ${newSender}` : 'Add New Message'}
                </Text>

                <TextInput
                  style={styles.input}
                  placeholder="Sender name (e.g., Unknown, Sarah, etc.)"
                  placeholderTextColor={colors.textSecondary}
                  value={newSender}
                  onChangeText={setNewSender}
                  editable={!(messages.length > 0 && newSender.trim() !== '')}
                />

                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Message content"
                  placeholderTextColor={colors.textSecondary}
                  value={newContent}
                  onChangeText={setNewContent}
                  multiline
                  numberOfLines={4}
                />

                <TouchableOpacity
                  style={[
                    styles.addButton,
                    (!newSender.trim() || !newContent.trim()) && styles.disabledButton,
                  ]}
                  onPress={addMessage}
                  disabled={!newSender.trim() || !newContent.trim()}
                  activeOpacity={0.7}
                >
                  <Ionicons name="add-circle" size={16} color="#fff" style={styles.buttonIcon} />
                  <Text style={styles.addButtonText}>Add Message</Text>
                </TouchableOpacity>
              </View>

              {/* Messages Preview */}
              {messages.length > 0 && (
                <View style={styles.previewSection}>
                  <Text style={styles.sectionTitle}>
                    Messages Preview ({messages.length})
                  </Text>
                  <View style={styles.messagesList}>
                    {messages.map((message, index) => (
                      <View key={message.id} style={styles.messageItem}>
                        <View style={styles.messageContent}>
                          <Text style={styles.messageSender}>{message.sender}:</Text>
                          <Text style={styles.messageText}>{message.content}</Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => deleteMessage(message.id)}
                          style={styles.deleteButton}
                        >
                          <Ionicons name="trash" size={16} color="#ff6b6b" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Actions */}
            <View style={styles.footer}>
              <TouchableOpacity
                style={[styles.footerButton, styles.cancelButton]}
                onPress={cancelChat}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.footerButton,
                  styles.insertButton,
                  messages.length === 0 && styles.disabledButton,
                ]}
                onPress={insertChat}
                disabled={messages.length === 0}
                activeOpacity={0.7}
              >
                <Text style={styles.insertButtonText}>
                  Insert Chat ({messages.length})
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const getStyles = (themeColors: any) =>
  StyleSheet.create({
    // Open Button
    openButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: '#10b981',
      borderRadius: 6,
    },
    buttonIcon: {
      marginRight: 6,
    },
    openButtonText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '600',
    },

    // Modal
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    centeredView: {
      flex: 1,
      justifyContent: 'flex-start',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 60,
    },
    modalView: {
      backgroundColor: themeColors.backgroundSecondary,
      borderRadius: 12,
      width: '100%',
      flex: 1,
      flexDirection: 'column',
      overflow: 'hidden',
    },

    // Header
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: themeColors.border,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: themeColors.text,
    },
    closeButton: {
      padding: 8,
    },

    // Content
    content: {
      flex: 1,
      paddingHorizontal: 16,
      paddingVertical: 16,
    },

    // Form Section
    formSection: {
      backgroundColor: themeColors.background,
      borderRadius: 8,
      padding: 12,
      marginBottom: 16,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: themeColors.textSecondary,
      marginBottom: 12,
    },
    input: {
      backgroundColor: themeColors.background,
      borderWidth: 1,
      borderColor: themeColors.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: themeColors.text,
      fontSize: 14,
      marginBottom: 10,
    },
    textArea: {
      textAlignVertical: 'top',
      minHeight: 100,
    },
    addButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#3b82f6',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 8,
    },
    addButtonText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '600',
      marginLeft: 6,
    },
    disabledButton: {
      opacity: 0.5,
    },

    // Preview Section
    previewSection: {
      backgroundColor: themeColors.background,
      borderRadius: 8,
      padding: 12,
      marginBottom: 16,
    },
    messagesList: {
      gap: 10,
    },
    messageItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: themeColors.backgroundSecondary,
      borderRadius: 8,
      padding: 12,
      justifyContent: 'space-between',
    },
    messageContent: {
      flex: 1,
    },
    messageSender: {
      fontSize: 12,
      color: themeColors.textSecondary,
      marginBottom: 4,
      fontWeight: '600',
    },
    messageText: {
      fontSize: 14,
      color: themeColors.text,
    },
    deleteButton: {
      padding: 8,
      marginLeft: 12,
    },

    // Footer
    footer: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingVertical: 16,
      borderTopWidth: 1,
      borderTopColor: themeColors.border,
      gap: 10,
    },
    footerButton: {
      flex: 1,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelButton: {
      backgroundColor: themeColors.background,
      borderWidth: 1,
      borderColor: themeColors.border,
    },
    cancelButtonText: {
      color: themeColors.text,
      fontSize: 14,
      fontWeight: '600',
    },
    insertButton: {
      backgroundColor: '#10b981',
    },
    insertButtonText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '600',
    },
  });

export default InlineChatEditor;
