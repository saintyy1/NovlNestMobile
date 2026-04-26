import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Image,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  Platform,
  Keyboard,
  InputAccessoryView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import CachedImage from './CachedImage';
import { spacing } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Block {
  id: string;
  type: 'text' | 'image';
  content: string;
  isLoading?: boolean;
}

interface ChapterBlockEditorProps {
  content: string;
  onChangeContent: (newContent: string) => void;
  onUploadImage: () => Promise<string | null>;
  isDistractionFree?: boolean;
  autoSaveStatus?: string;
  wordCount: number;
  onExitDistractionFree?: () => void;
  header?: React.ReactNode;
}

const BlockItem = React.memo(({
  block,
  onTextChange,
  onFocus,
  onSelectionChange,
  isFocused,
  selection,
  colors,
  accessoryId,
  onRemove,
  index
}: {
  block: Block;
  onTextChange: (id: string, text: string) => void;
  onFocus: (id: string) => void;
  onSelectionChange: (id: string, start: number, end: number) => void;
  isFocused: boolean;
  selection?: { start: number; end: number } | null;
  colors: any;
  accessoryId: string;
  onRemove: (id: string) => void;
  index: number;
}) => {
  const styles = getBlockStyles(colors);

  if (block.type === 'text') {
    return (
      <TextInput
        style={[
          styles.textInput,
          block.content === '' && !isFocused && { height: 0, marginVertical: 0, paddingVertical: 0 }
        ]}
        multiline
        scrollEnabled={false}
        value={block.content}
        onChangeText={(text) => onTextChange(block.id, text)}
        onFocus={() => onFocus(block.id)}
        onSelectionChange={(e) => {
          if (isFocused) {
            onSelectionChange(block.id, e.nativeEvent.selection.start, e.nativeEvent.selection.end);
          }
        }}
        onKeyPress={({ nativeEvent }) => {
          if (nativeEvent.key === 'Backspace' && block.content === '' && onRemove) {
            onRemove(block.id);
          }
        }}
        selection={(isFocused && selection) ? selection : undefined}
        placeholder={index === 0 ? "Start writing..." : ""}
        placeholderTextColor={colors.textSecondary + '80'}
        keyboardAppearance="dark"
        cursorColor={colors.primary}
        selectionColor={colors.primary + '40'}
      />
    );
  }

  const getAspectRatio = (url: string) => {
    return 3 / 4; // Consistent book aspect ratio
  };

  return (
    <View style={styles.imageBlock}>
      {block.isLoading ? (
        <View style={styles.loadingPlaceholder}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>Uploading image...</Text>
          <TouchableOpacity
            style={styles.removeImage}
            onPress={() => onRemove(block.id)}
          >
            <Ionicons name="close-circle" size={24} color={colors.error} />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.illustrationWrapper}>
          <CachedImage
            uri={block.content}
            style={[styles.embeddedImage, { aspectRatio: getAspectRatio(block.content) }]}
            contentFit="cover"
          />
          <TouchableOpacity
            style={styles.removeImage}
            onPress={() => onRemove(block.id)}
          >
            <Ionicons name="close-circle" size={24} color={colors.error} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
});

const accessoryId = 'zen-editor-tools';

const ChapterBlockEditor: React.FC<ChapterBlockEditorProps> = ({
  content,
  onChangeContent,
  onUploadImage,
  isDistractionFree,
  autoSaveStatus,
  wordCount,
  onExitDistractionFree,
  header,
}) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const selectionRef = useRef({ start: 0, end: 0 });
  const [forcedSelection, setForcedSelection] = useState<{ start: number; end: number } | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  // Ref to track content for comparison to prevent unnecessary re-parses
  const lastParsedContent = useRef<string>('');
  const lastSentContent = useRef<string>('');
  const focusRequestRef = useRef<string | null>(null);
  const blocksRef = useRef<Block[]>([]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true)
    );
    const hideSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false)
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  // Parse content string into blocks ONLY when content changes from EXTERNAL source
  useEffect(() => {
    if (content === lastSentContent.current && blocks.length > 0) {
      return;
    }

    // Protect local state if there's an active upload
    if (blocks.some(b => b.isLoading)) {
      return;
    }

    const newBlocks: Block[] = [];
    const imageRegex = /\[IMAGE:(.*?)\]/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let blockCount = 0;

    while ((match = imageRegex.exec(content)) !== null) {
      if (match!.index > lastIndex) {
        newBlocks.push({
          id: `text-${blockCount++}`,
          type: 'text' as const,
          content: content.substring(lastIndex, match!.index),
        });
      }
      const existing = blocksRef.current.find(b => b.type === 'image' && b.content === match![1]);
      const id = existing ? existing.id : `image-${blockCount++}`;
      const isLoading = existing ? existing.isLoading : false;

      newBlocks.push({
        id,
        type: 'image' as const,
        content: match![1],
        isLoading,
      });
      lastIndex = imageRegex.lastIndex;
    }

    if (lastIndex < content.length || newBlocks.length === 0) {
      newBlocks.push({
        id: `text-${blockCount++}`,
        type: 'text' as const,
        content: content.substring(lastIndex),
      });
    }

    // Preserve IDs to prevent re-mounting components
    const preservedBlocks = newBlocks.map((newBlock, idx) => {
      const existing = blocksRef.current[idx];
      if (existing && existing.type === newBlock.type) {
        return { ...newBlock, id: existing.id };
      }
      return newBlock;
    });

    blocksRef.current = preservedBlocks;
    setBlocks(preservedBlocks);
    lastParsedContent.current = content;
    lastSentContent.current = content;
  }, [content]);

  const syncToParent = React.useCallback((updatedBlocks: Block[]) => {
    const newContentString = updatedBlocks
      .map((b) => (b.type === 'image' ? `[IMAGE:${b.content}]` : b.content))
      .join('');

    if (newContentString !== lastSentContent.current) {
      lastSentContent.current = newContentString;
      onChangeContent(newContentString);
    }
  }, [onChangeContent]);

  const handleTextChange = React.useCallback((id: string, text: string) => {
    // 🚨 FIX: Construct the new state FIRST
    const next = blocksRef.current.map((b) => (b.id === id ? { ...b, content: text } : b));
    
    // Update local state and ref
    setBlocks(next);
    blocksRef.current = next;
    
    // 🛡️ COLLISION PROTECTION: Defer the sync to avoid "setState during render" 
    // when React is batching parent and child updates.
    requestAnimationFrame(() => {
      syncToParent(next);
    });
  }, [syncToParent]);

  const handleAddImage = React.useCallback(async () => {
    const imageBlockId = `image-${Date.now()}`;
    const nextTextBlockId = `text-${Date.now() + 1}`;

    let updatedBlocks: Block[] = [];

    if (focusedBlockId) {
      const focusedIndex = blocks.findIndex((b) => b.id === focusedBlockId);
      if (focusedIndex !== -1 && blocks[focusedIndex].type === 'text') {
        const block = blocks[focusedIndex];
        const { start } = selectionRef.current;

        const beforeText = block.content.substring(0, start);
        const afterText = block.content.substring(start);

        const insertion: Block[] = [];
        
        // If we are at the start of an empty block, just replace it with image + new empty text
        if (beforeText === '' && afterText === '') {
          insertion.push({ id: imageBlockId, type: 'image' as const, content: '', isLoading: true });
          insertion.push({ id: nextTextBlockId, type: 'text' as const, content: '' });
        } else {
          insertion.push({ id: block.id, type: 'text' as const, content: beforeText });
          insertion.push({ id: imageBlockId, type: 'image' as const, content: '', isLoading: true });
          insertion.push({ id: nextTextBlockId, type: 'text' as const, content: afterText });
        }

        updatedBlocks = [...blocks];
        updatedBlocks.splice(focusedIndex, 1, ...insertion);
      } else if (focusedIndex !== -1 && blocks[focusedIndex].type === 'image') {
        // Adding image after an image
        updatedBlocks = [...blocks];
        updatedBlocks.splice(focusedIndex + 1, 0, 
          { id: imageBlockId, type: 'image' as const, content: '', isLoading: true },
          { id: nextTextBlockId, type: 'text' as const, content: '' }
        );
      }
    } else {
      updatedBlocks = [...blocks, 
        { id: imageBlockId, type: 'image' as const, content: '', isLoading: true },
        { id: nextTextBlockId, type: 'text' as const, content: '' }
      ];
    }

    if (updatedBlocks.length > 0) {
      blocksRef.current = updatedBlocks;
      setBlocks(updatedBlocks);
      syncToParent(updatedBlocks);

      focusRequestRef.current = nextTextBlockId;
      setFocusedBlockId(nextTextBlockId);
      selectionRef.current = { start: 0, end: 0 };
      setForcedSelection({ start: 0, end: 0 });
    }

    const url = await onUploadImage();

    setBlocks(currentBlocks => {
      // Check if block still exists (user might have cancelled/removed it)
      const exists = currentBlocks.some(b => b.id === imageBlockId);
      if (!exists) return currentBlocks;

      const next = currentBlocks.map(b => b.id === imageBlockId ? { ...b, content: url || '', isLoading: false } : b);
      const filtered = url ? next : next.filter(b => b.id !== imageBlockId);
      blocksRef.current = filtered;
      
      requestAnimationFrame(() => {
        syncToParent(filtered);
      });
      
      return filtered;
    });
  }, [onUploadImage, syncToParent]);

  const applyFormat = (format: 'bold' | 'italic' | 'heading') => {
    if (!focusedBlockId) return;
    const block = blocks.find(b => b.id === focusedBlockId);
    if (!block || block.type !== 'text') return;

    const { start, end } = selectionRef.current;
    const beforeText = block.content.substring(0, start);
    const selectedText = block.content.substring(start, end);
    const afterText = block.content.substring(end);
 
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
    handleTextChange(focusedBlockId, newContent);
    selectionRef.current = { start: newCursorPos, end: newCursorPos };
    setForcedSelection({ start: newCursorPos, end: newCursorPos });
  };

  const handleCanvasTap = () => {
    if (blocks.length === 0) return;

    const lastBlock = blocks[blocks.length - 1];
    if (lastBlock.type === 'text') {
      setFocusedBlockId(lastBlock.id);
      focusRequestRef.current = lastBlock.id;
    } else {
      // Add a new text block if the last one is an image
      const newId = `text-${Date.now()}`;
      const next = [...blocks, { id: newId, type: 'text' as const, content: '' }];
      setBlocks(next);
      blocksRef.current = next;
      setFocusedBlockId(newId);
      focusRequestRef.current = newId;
      
      requestAnimationFrame(() => {
        syncToParent(next);
      });
    }
  };

  const removeBlock = React.useCallback((id: string) => {
    setBlocks(currentBlocks => {
      const index = currentBlocks.findIndex(b => b.id === id);
      if (index === -1) return currentBlocks;

      let updated = [...currentBlocks];
      updated.splice(index, 1);

      // Merge adjacent text blocks
      const merged: Block[] = [];
      for (const b of updated) {
        const last = merged[merged.length - 1];
        if (last && last.type === 'text' && b.type === 'text') {
          last.content += b.content;
        } else {
          merged.push(b);
        }
      }

      const final = merged.length === 0 ? [{ id: 'text-0', type: 'text' as const, content: '' }] : merged;
      blocksRef.current = final;

      requestAnimationFrame(() => {
        syncToParent(final);
      });

      return final;
    });
  }, [syncToParent]);

  const handleFocus = React.useCallback((id: string) => {
    setFocusedBlockId(id);
    if (focusRequestRef.current === id) {
      focusRequestRef.current = null;
    }
  }, []);

  const handleSelectionChange = React.useCallback((id: string, start: number, end: number) => {
    selectionRef.current = { start, end };
    // Clear forced selection once user moves cursor manually
    setForcedSelection(prev => {
      if (prev && (prev.start !== start || prev.end !== end)) {
        return null;
      }
      return prev;
    });
  }, []);

  const styles = getStyles(colors, isDistractionFree, insets);

  const renderToolbarActions = () => (
    <View style={styles.accessoryBar}>
      {onExitDistractionFree && isDistractionFree && (
        <TouchableOpacity style={styles.exitPill} onPress={onExitDistractionFree}>
          <Ionicons name="contract-outline" size={18} color={colors.primary} />
          <Text style={styles.exitText}>Exit Focus</Text>
        </TouchableOpacity>
      )}

      <View style={styles.accessoryToolGroup}>
        <TouchableOpacity style={styles.accessoryButton} onPress={handleAddImage}>
          <Ionicons name="image-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
        <View style={styles.accessoryDivider} />
        <TouchableOpacity style={styles.accessoryButton} onPress={() => applyFormat('bold')}>
          <Ionicons name="text-outline" size={20} color={colors.primary} />
          <Text style={styles.accessoryMiniLabel}>B</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.accessoryButton} onPress={() => applyFormat('italic')}>
          <Ionicons name="text-outline" size={20} color={colors.primary} />
          <Text style={[styles.accessoryMiniLabel, { fontStyle: 'italic' }]}>I</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.accessoryButton} onPress={() => applyFormat('heading')}>
          <Ionicons name="text-outline" size={20} color={colors.primary} />
          <Text style={[styles.accessoryMiniLabel, { fontWeight: '900' }]}>H</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.accessoryStats}>
        <Text style={styles.accessoryStatText}>{wordCount} words</Text>
        {autoSaveStatus && (
          <Text style={styles.accessorySaveText}>{autoSaveStatus}</Text>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Top Header (Visible mainly when NOT in Zen mode or when not typing) */}
      {!isDistractionFree && (
        <View style={styles.topHeader}>
          <View style={styles.topHeaderContent}>
            <Text style={styles.topHeaderTitle}>Manuscript</Text>
            <View style={styles.topHeaderStats}>
              <Text style={styles.statText}>{wordCount} words</Text>
            </View>
          </View>
        </View>
      )}

      {/* Improved Zenith Exit Button - Only visible when NOT typing to keep the view clean */}
      {isDistractionFree && !keyboardVisible && onExitDistractionFree && (
        <TouchableOpacity
          style={styles.zenithExitContainer}
          onPress={onExitDistractionFree}
        >
          <View style={styles.zenithPill}>
            <Ionicons name="contract-outline" size={18} color="#fff" />
            <Text style={styles.zenithText}>Exit Focus</Text>
          </View>
        </TouchableOpacity>
      )}

      <ScrollView
        style={styles.editor}
        contentContainerStyle={styles.editorContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
        showsVerticalScrollIndicator={false}
      >
        {header}
        {blocks.map((block, index) => (
          <BlockItem
            key={block.id}
            block={block}
            onTextChange={handleTextChange}
            onFocus={handleFocus}
            onSelectionChange={handleSelectionChange}
            isFocused={focusedBlockId === block.id}
            selection={forcedSelection || undefined}
            colors={colors}
            accessoryId={accessoryId}
            onRemove={removeBlock}
            index={index}
          />
        ))}
        <TouchableOpacity
          key="canvas-tap-area"
          style={{ height: 300, width: '100%' }}
          activeOpacity={1}
          onPress={handleCanvasTap}
        />
      </ScrollView>

      {/* Unified Formatting Bar - ALWAYS at the bottom of the container */}
      {keyboardVisible && (
        <View style={styles.accessoryWrapper}>
          {renderToolbarActions()}
        </View>
      )}
    </View>
  );
};

const getBlockStyles = (colors: any) => StyleSheet.create({
  textInput: {
    fontSize: 19,
    lineHeight: 32,
    color: colors.text,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    padding: 0,
    minHeight: 40,
    letterSpacing: 0.2,
    marginBottom: spacing.md,
  },
  imageBlock: {
    marginVertical: spacing.xl,
    paddingHorizontal: 4,
  },
  loadingPlaceholder: {
    height: 200,
    backgroundColor: colors.primary + '05',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary + '15',
    borderStyle: 'dashed',
  },
  loadingText: {
    fontSize: 12,
    color: colors.primary,
    marginTop: spacing.sm,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  illustrationWrapper: {
    position: 'relative',
    borderRadius: 24,
    backgroundColor: colors.surface,
    padding: 6,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
  },
  embeddedImage: {
    width: '100%',
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  removeImage: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 15,
    padding: 2,
  },
});

const getStyles = (colors: any, isDistractionFree?: boolean, insets?: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  statText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600' as const,
    letterSpacing: 0.5,
  },
  topHeader: {
    backgroundColor: colors.surface + 'FA',
    borderBottomWidth: 1,
    borderBottomColor: colors.border + '22',
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  topHeaderContent: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  topHeaderTitle: {
    fontSize: 12,
    fontWeight: '800' as const,
    color: colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 1.5,
  },
  topHeaderStats: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: colors.primary + '10',
  },
  accessoryBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderTopWidth: 0,
    borderTopColor: colors.border + '44',
    height: 50,
  },
  accessoryToolGroup: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 2,
  },
  accessoryButton: {
    width: 44,
    height: 40,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    position: 'relative' as const,
  },
  accessoryMiniLabel: {
    position: 'absolute' as const,
    fontSize: 9,
    fontWeight: '900' as const,
    color: colors.primary,
    bottom: 8,
    backgroundColor: colors.background,
    paddingHorizontal: 2,
  },
  accessoryDivider: {
    width: 1,
    height: 20,
    backgroundColor: colors.border,
    marginHorizontal: 4,
  },
  accessoryStats: {
    alignItems: 'flex-end' as const,
  },
  accessoryStatText: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: colors.textSecondary,
  },
  accessorySaveText: {
    fontSize: 9,
    color: colors.primary,
    fontWeight: '600' as const,
  },
  accessoryWrapper: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border + '20',
  },
  editor: {
    flex: 1,
  },
  editorContent: {
    padding: isDistractionFree ? spacing.lg : spacing.md,
    paddingTop: isDistractionFree ? insets.top + spacing.md : spacing.lg,
    paddingBottom: 120,
  },
  exitPill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: colors.primary + '15',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  exitText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '700' as const,
  },
  zenithExitContainer: {
    position: 'absolute' as const,
    top: (insets?.top || 0) + spacing.sm,
    right: spacing.md,
    zIndex: 2000,
  },
  zenithPill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  zenithText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '700' as const,
    letterSpacing: 0.1,
  },
});

export default ChapterBlockEditor;
