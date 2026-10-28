import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { fontFamily, spacing } from '@/theme/tokens';
import { Text } from '@/ui/text';
import { splitTaskRefs } from './task-refs';

interface RichTextProps {
  text: string;
  onOpenTask: (taskId: string) => void;
}

const BULLET_RE = /^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/;

/**
 * The subset of Markdown the agent writes (paragraphs, bullet and numbered
 * lists, **bold**) plus `{{task:id|title}}` mentions as tappable text.
 */
export function RichText({ text, onOpenTask }: RichTextProps) {
  const { colors } = useTheme();
  const lines = text.replace(/\r\n/g, '\n').trim().split('\n');

  const inline = (line: string, key: string) =>
    splitTaskRefs(line).map((segment, index) => {
      if (segment.type === 'task') {
        return (
          <Text
            key={`${key}-t${index}`}
            variant="body-md"
            color="contentInfo"
            accessibilityRole="link"
            accessibilityHint="Abre a tarefa"
            onPress={() => onOpenTask(segment.id)}
            style={styles.mention}
          >
            {segment.title}
          </Text>
        );
      }
      return segment.text.split(/(\*\*[^*]+\*\*)/g).map((part, partIndex) =>
        part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
          <Text key={`${key}-b${index}-${partIndex}`} variant="body-md" style={styles.bold}>
            {part.slice(2, -2)}
          </Text>
        ) : (
          <Fragment key={`${key}-p${index}-${partIndex}`}>{part}</Fragment>
        ),
      );
    });

  return (
    <View style={styles.root}>
      {lines.map((line, index) => {
        if (!line.trim()) return <View key={index} style={styles.gap} />;
        const bullet = BULLET_RE.exec(line);
        if (bullet) {
          return (
            <View key={index} style={styles.bulletRow}>
              <Text variant="body-md" style={{ color: colors.contentSecondary }}>
                {bullet[1] ? `${bullet[1]}.` : '•'}
              </Text>
              <Text variant="body-md" style={styles.flex} selectable>
                {inline(bullet[2] ?? '', `l${index}`)}
              </Text>
            </View>
          );
        }
        const heading = /^#{1,6}\s+(.*)$/.exec(line);
        return (
          <Text key={index} variant="body-md" style={heading ? styles.bold : undefined} selectable>
            {inline(heading ? (heading[1] ?? '') : line, `l${index}`)}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.xxs,
  },
  gap: {
    height: spacing.xs,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingLeft: spacing.xs,
  },
  flex: {
    flex: 1,
  },
  bold: {
    fontFamily: fontFamily.semibold,
  },
  mention: {
    fontFamily: fontFamily.semibold,
    textDecorationLine: 'underline',
  },
});
