import { Fragment, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text as RNText, View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { fontFamily, radius, spacing } from '@/theme/tokens';
import { Text } from '@/ui/text';
import type { DocNode } from './summary-steps';

interface Mark {
  type?: string;
}

function parseBlocks(raw: string): DocNode[] | null {
  try {
    const doc = JSON.parse(raw) as DocNode;
    return doc && doc.type === 'doc' ? (doc.content ?? []) : null;
  } catch {
    return null;
  }
}

/** Read-only view of a TipTap doc (the web editor's format): text, headings, lists, quotes. */
export function DocView({ raw }: { raw: string }) {
  const blocks = parseBlocks(raw);
  if (!blocks) {
    // Legacy rows hold plain text.
    return <Text variant="body-md">{raw}</Text>;
  }
  return <View style={styles.doc}>{blocks.map((block, index) => <Block key={index} node={block} />)}</View>;
}

function Inline({ nodes }: { nodes: DocNode[] }) {
  const { colors } = useTheme();
  return (
    <>
      {nodes.map((node, index) => {
        if (node.type === 'hardBreak') return <Fragment key={index}>{'\n'}</Fragment>;
        if (node.type !== 'text') return <Inline key={index} nodes={node.content ?? []} />;
        const marks = new Set(((node as { marks?: Mark[] }).marks ?? []).map((mark) => mark.type));
        return (
          <RNText
            key={index}
            style={[
              marks.has('bold') && { fontFamily: fontFamily.semibold },
              marks.has('italic') && styles.italic,
              marks.has('strike') && styles.strike,
              marks.has('underline') && styles.underline,
              marks.has('code') && { backgroundColor: colors.surfaceSecondary },
              marks.has('link') && { color: colors.contentInfo },
            ]}
          >
            {node.text}
          </RNText>
        );
      })}
    </>
  );
}

function Block({ node, depth = 0 }: { node: DocNode; depth?: number }): ReactNode {
  const { colors } = useTheme();
  const { t } = useTranslation('notes');
  const children = node.content ?? [];
  switch (node.type) {
    case 'paragraph':
      return children.length > 0 ? (
        <Text variant="body-md">
          <Inline nodes={children} />
        </Text>
      ) : null;
    case 'heading':
      return (
        <Text variant={node.attrs?.level === 1 ? 'heading-md' : 'heading-sm'} accessibilityRole="header" style={styles.heading}>
          <Inline nodes={children} />
        </Text>
      );
    case 'bulletList':
    case 'orderedList':
    case 'taskList': {
      const start = typeof node.attrs?.start === 'number' ? node.attrs.start : 1;
      return (
        <View style={styles.list}>
          {children.map((item, index) => {
            const marker =
              node.type === 'orderedList'
                ? `${start + index}.`
                : node.type === 'taskList'
                  ? item.attrs?.checked
                    ? '☑'
                    : '☐'
                  : '•';
            return (
              <View key={index} style={styles.listItem}>
                <Text variant="body-md" color="contentSecondary" style={styles.marker}>
                  {marker}
                </Text>
                <View style={styles.itemBody}>
                  {(item.content ?? []).map((child, childIndex) => (
                    <Block key={childIndex} node={child} depth={depth + 1} />
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      );
    }
    case 'blockquote':
      return (
        <View style={[styles.quote, { borderLeftColor: colors.borderPrimary }]}>
          {children.map((child, index) => (
            <Block key={index} node={child} depth={depth} />
          ))}
        </View>
      );
    case 'codeBlock':
      return (
        <View style={[styles.code, { backgroundColor: colors.surfaceSecondary }]}>
          <Text variant="body-sm">
            <Inline nodes={children} />
          </Text>
        </View>
      );
    case 'horizontalRule':
      return <View style={[styles.rule, { backgroundColor: colors.borderPrimary }]} />;
    case 'image':
      return (
        <Text variant="body-sm" color="contentTertiary">
          {t('doc.image')}
        </Text>
      );
    default:
      return children.length > 0 ? (
        <>
          {children.map((child, index) => (
            <Block key={index} node={child} depth={depth} />
          ))}
        </>
      ) : null;
  }
}

const styles = StyleSheet.create({
  doc: {
    gap: spacing.md,
  },
  heading: {
    marginTop: spacing.sm,
  },
  italic: {
    fontStyle: 'italic',
  },
  strike: {
    textDecorationLine: 'line-through',
  },
  underline: {
    textDecorationLine: 'underline',
  },
  list: {
    gap: spacing.xs,
  },
  listItem: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  marker: {
    minWidth: 16,
  },
  itemBody: {
    flex: 1,
    gap: spacing.xs,
  },
  quote: {
    borderLeftWidth: 3,
    paddingLeft: spacing.md,
    gap: spacing.sm,
  },
  code: {
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
  },
});
