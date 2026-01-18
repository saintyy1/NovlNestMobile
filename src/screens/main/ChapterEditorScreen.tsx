import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { InlineChatEditor, type ChatMessage } from '../../components/InlineChatEditor';
import { spacing } from '../../theme';

interface ChapterEditorScreenProps {
  navigation: any;
  route: any;
}

export const ChapterEditorScreen: React.FC<ChapterEditorScreenProps> = ({ navigation, route }) => {
  const { colors } = useTheme();
  const { chapterNumber, initialTitle = '', initialContent = '', onSave } = route.params;
  
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [isPreview, setIsPreview] = useState(false);

  const styles = getStyles(colors);

  const handleSave = () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a chapter title');
      return;
    }
    if (!content.trim()) {
      Alert.alert('Error', 'Please write some content for your chapter');
      return;
    }

    onSave({ title: title.trim(), content: content.trim() });
    navigation.goBack();
  };

  const insertChatIntoContent = (messages: ChatMessage[]) => {
    const chatData = `[CHAT_START]${JSON.stringify(messages)}[CHAT_END]`;
    const newContent = content + (content ? '\n\n' : '') + chatData;
    setContent(newContent);
  };

  const renderMarkdownPreview = () => {
    const lines = content.split('\n');
    return lines.map((line: string, index: number) => {
      // Heading
      if (line.startsWith('### ')) {
        return (
          <Text key={index} style={[styles.previewText, styles.previewHeading]}>
            {line.replace(/^### /, '')}
          </Text>
        );
      }
      
      // Process bold and italic in text
      const parts: Array<{ text: string; bold?: boolean; italic?: boolean }> = [];
      let currentText = line;
      let buffer = '';
      let i = 0;
      
      while (i < currentText.length) {
        if (currentText.substring(i, i + 2) === '**') {
          if (buffer) parts.push({ text: buffer });
          buffer = '';
          const endIndex = currentText.indexOf('**', i + 2);
          if (endIndex !== -1) {
            parts.push({ text: currentText.substring(i + 2, endIndex), bold: true });
            i = endIndex + 2;
          } else {
            buffer += '**';
            i += 2;
          }
        } else if (currentText[i] === '*' && currentText[i + 1] !== '*') {
          if (buffer) parts.push({ text: buffer });
          buffer = '';
          const endIndex = currentText.indexOf('*', i + 1);
          if (endIndex !== -1 && currentText[endIndex - 1] !== '*') {
            parts.push({ text: currentText.substring(i + 1, endIndex), italic: true });
            i = endIndex + 1;
          } else {
            buffer += '*';
            i += 1;
          }
        } else {
          buffer += currentText[i];
          i++;
        }
      }
      if (buffer) parts.push({ text: buffer });
      
      return (
        <Text key={index} style={styles.previewText}>
          {parts.map((part, idx) => (
            <Text
              key={idx}
              style={[
                part.bold && styles.previewBold,
                part.italic && styles.previewItalic,
              ]}
            >
              {part.text}
            </Text>
          ))}
          {index < lines.length - 1 ? '\n' : ''}
        </Text>
      );
    });
  };

  const applyMarkdownFormat = (format: 'bold' | 'italic' | 'heading') => {
    const { start, end } = selection;
    
    const beforeText = content.substring(0, start);
    const selectedText = content.substring(start, end);
    const afterText = content.substring(end);
    
    let formattedText = selectedText;
    let newCursorPos = end;
    
    if (format === 'bold') {
      formattedText = selectedText ? `**${selectedText}**` : '**bold**';
      newCursorPos = start + (selectedText ? selectedText.length + 4 : 8);
    } else if (format === 'italic') {
      formattedText = selectedText ? `*${selectedText}*` : '*italic*';
      newCursorPos = start + (selectedText ? selectedText.length + 2 : 8);
    } else if (format === 'heading') {
      formattedText = selectedText ? `### ${selectedText}` : '### Heading';
      newCursorPos = start + (selectedText ? selectedText.length + 4 : 11);
    }
    
    const newContent = beforeText + formattedText + afterText;
    setContent(newContent);
    setSelection({ start: newCursorPos, end: newCursorPos });
  };

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: `Chapter ${chapterNumber}`,
      headerStyle: {
        backgroundColor: colors.primary,
      },
      headerTintColor: '#fff',
      headerRight: () => (
        <TouchableOpacity
          onPress={handleSave}
          style={styles.headerButton}
        >
          <Ionicons name="checkmark" size={24} color="#fff" />
        </TouchableOpacity>
      ),
    });
  }, [navigation, title, content]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
        {/* Chapter Title */}
        <View style={styles.section}>
          <Text style={styles.label}>Chapter Title</Text>
          <TextInput
            style={styles.titleInput}
            value={title}
            onChangeText={setTitle}
            placeholder={`Chapter ${chapterNumber} title`}
            placeholderTextColor={colors.textSecondary}
            autoFocus
          />
        </View>

        {/* Toolbar */}
        <View style={styles.toolbar}>
          <InlineChatEditor onAddChat={insertChatIntoContent} />
          <View style={styles.markdownButtons}>
            <TouchableOpacity
              style={styles.formatButton}
              onPress={() => applyMarkdownFormat('bold')}
            >
              <Text style={styles.formatButtonText}>B</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.formatButton}
              onPress={() => applyMarkdownFormat('italic')}
            >
              <Text style={[styles.formatButtonText, { fontStyle: 'italic' }]}>I</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.formatButton}
              onPress={() => applyMarkdownFormat('heading')}
            >
              <Text style={styles.formatButtonText}>H</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Chapter Content */}
        <View style={styles.section}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>Content</Text>
            <TouchableOpacity
              style={styles.previewButton}
              onPress={() => setIsPreview(!isPreview)}
            >
              <Ionicons
                name={isPreview ? 'create-outline' : 'eye-outline'}
                size={18}
                color={colors.primary}
              />
              <Text style={styles.previewButtonText}>
                {isPreview ? 'Edit' : 'Preview'}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.contentContainer}>
            {isPreview ? (
              <View style={styles.previewContainer}>
                {content.trim() ? (
                  renderMarkdownPreview()
                ) : (
                  <Text style={[styles.previewText, { color: colors.textSecondary }]}>
                    No content to preview
                  </Text>
                )}
              </View>
            ) : (
              <TextInput
                style={styles.contentInput}
                value={content}
                onChangeText={setContent}
                onSelectionChange={(event) => setSelection(event.nativeEvent.selection)}
                selection={selection}
                placeholder="Write your chapter content here... Highlight your words or sentences and tap the purple buttons above to format: **bold**, *italic*, ### headings"
                placeholderTextColor={colors.textSecondary}
                multiline
                scrollEnabled={false}
                textAlignVertical="top"
              />
            )}
          </View>
          <View style={styles.statsBar}>
            <View style={styles.statItem}>
              <Ionicons name="text-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.statText}>{content.length} characters</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="document-text-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.statText}>
                {content.trim().split(/\s+/).filter((w: string) => w).length} words
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.bottomSpacing} />
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Floating Save Button */}
      <View style={styles.floatingButtonContainer}>
        <TouchableOpacity
          style={styles.saveButton}
          onPress={handleSave}
          activeOpacity={0.8}
        >
          <Ionicons name="save" size={20} color="#fff" />
          <Text style={styles.saveButtonText}>Save Chapter</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const getStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  headerButton: {
    marginRight: spacing.md,
  },
  section: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  label: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '700',
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  previewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  previewButtonText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
  },
  previewContainer: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    minHeight: 400,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  previewText: {
    fontSize: 16,
    color: colors.text,
    lineHeight: 24,
  },
  previewBold: {
    fontWeight: '700',
  },
  previewItalic: {
    fontStyle: 'italic',
  },
  previewHeading: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  titleInput: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 12,
    gap: spacing.sm,
  },
  markdownButtons: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  formatButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    minWidth: 38,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  formatButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  contentContainer: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    minHeight: 400,
  },
  contentInput: {
    padding: spacing.md,
    fontSize: 16,
    color: colors.text,
    lineHeight: 24,
    minHeight: 400,
  },
  statsBar: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  bottomSpacing: {
    height: spacing.xl,
  },
  floatingButtonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 16,
    padding: spacing.lg,
    gap: spacing.sm,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  saveButtonText: {
    fontSize: 17,
    color: '#fff',
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});

export default ChapterEditorScreen;
