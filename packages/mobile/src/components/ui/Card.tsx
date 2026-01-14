/**
 * Card Component - Jarvi Mobile
 * 
 * Card component using design tokens from shared package
 */

import React from 'react';
import { View, ViewStyle, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { spacing } from '@jarvi/shared/src/design-tokens/platforms/native';

// ============================================================================
// TYPES
// ============================================================================

export interface CardProps {
  children: React.ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  style?: ViewStyle;
  testID?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function Card({
  children,
  padding = 'md',
  style,
  testID,
}: CardProps) {
  const { theme } = useTheme();

  // Padding styles
  const paddingStyles = {
    none: {},
    sm: { padding: spacing[4] },
    md: { padding: spacing[6] },
    lg: { padding: spacing[8] },
  };

  // Build styles
  const cardStyle: ViewStyle = StyleSheet.flatten([
    styles.card,
    {
      backgroundColor: theme.semanticSurfaceSurfacePrimary,
      borderColor: theme.semanticBordersBorderPrimary,
    },
    paddingStyles[padding],
    style,
  ]);

  return (
    <View style={cardStyle} testID={testID}>
      {children}
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  card: {
    borderRadius: spacing[3],
    borderWidth: 1,
  },
});
