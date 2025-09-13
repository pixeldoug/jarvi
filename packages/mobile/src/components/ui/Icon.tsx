/**
 * Icon Component - Jarvi Mobile
 * 
 * Implementação mobile do componente Icon do design system.
 */

import React from 'react';
import { View, Text } from 'react-native';
import {
  Icon as BaseIcon,
  PrimaryIcon as BasePrimaryIcon,
  SecondaryIcon as BaseSecondaryIcon,
  SuccessIcon as BaseSuccessIcon,
  WarningIcon as BaseWarningIcon,
  ErrorIcon as BaseErrorIcon,
  InfoIcon as BaseInfoIcon,
  UserIcon as BaseUserIcon,
  SettingsIcon as BaseSettingsIcon,
  NotificationIcon as BaseNotificationIcon,
  SearchIcon as BaseSearchIcon,
  MenuIcon as BaseMenuIcon,
  CloseIcon as BaseCloseIcon,
  ArrowRightIcon as BaseArrowRightIcon,
  ArrowLeftIcon as BaseArrowLeftIcon,
  ArrowUpIcon as BaseArrowUpIcon,
  ArrowDownIcon as BaseArrowDownIcon,
  CheckIcon as BaseCheckIcon,
  PlusIcon as BasePlusIcon,
  MinusIcon as BaseMinusIcon,
  EditIcon as BaseEditIcon,
  DeleteIcon as BaseDeleteIcon,
  SaveIcon as BaseSaveIcon,
  HomeIcon as BaseHomeIcon,
  TasksIcon as BaseTasksIcon,
  NotesIcon as BaseNotesIcon,
  HabitsIcon as BaseHabitsIcon,
  FinancesIcon as BaseFinancesIcon,
  getIconStyles,
  getIconThemeStyles,
  type IconProps as BaseIconProps,
} from '@jarvi/shared';
import { useThemeMobile } from '../../hooks/useTheme';

// ============================================================================
// TIPOS
// ============================================================================

export interface IconProps extends BaseIconProps {
  onPress?: () => void;
}

// ============================================================================
// COMPONENTE
// ============================================================================

export function Icon({
  name,
  size = 'md',
  color = 'current',
  weight = 'regular',
  className = '',
  style,
  testID,
  onPress,
  ...props
}: IconProps) {
  const { isDark } = useThemeMobile();

  // Obter estilos inline
  const baseStyles = getIconStyles(size, color);
  const themeStyles = getIconThemeStyles(color, isDark);
  const finalStyles = { ...baseStyles, ...themeStyles, ...style };

  // Obter estilos do container
  const containerStyles = {
    width: finalStyles.width,
    height: finalStyles.height,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  };

  // Obter estilos do texto (emoji)
  const textStyles = {
    fontSize: size === 'xs' ? 12 : size === 'sm' ? 16 : size === 'md' ? 20 : size === 'lg' ? 24 : size === 'xl' ? 32 : 40,
    color: finalStyles.color,
  };

  // Renderizar ícone baseado no nome (usando emojis para simplicidade)
  const renderIcon = () => {
    switch (name) {
      case 'user':
        return '👤';
      case 'settings':
        return '⚙️';
      case 'notification':
        return '🔔';
      case 'search':
        return '🔍';
      case 'menu':
        return '☰';
      case 'close':
        return '✕';
      case 'arrow-right':
        return '→';
      case 'arrow-left':
        return '←';
      case 'arrow-up':
        return '↑';
      case 'arrow-down':
        return '↓';
      case 'check':
        return '✓';
      case 'plus':
        return '+';
      case 'minus':
        return '−';
      case 'edit':
        return '✏️';
      case 'delete':
        return '🗑️';
      case 'save':
        return '💾';
      case 'home':
        return '🏠';
      case 'tasks':
        return '✅';
      case 'notes':
        return '📝';
      case 'habits':
        return '💪';
      case 'finances':
        return '💰';
      default:
        return '?';
    }
  };

  const iconElement = (
    <View
      style={containerStyles}
      testID={testID}
      {...props}
    >
      <Text style={textStyles}>
        {renderIcon()}
      </Text>
    </View>
  );

  // Se onPress estiver definido, envolver em TouchableOpacity
  if (onPress) {
    return (
      <View onTouchEnd={onPress} style={{ opacity: 0.8 }}>
        {iconElement}
      </View>
    );
  }

  return iconElement;
}

// ============================================================================
// VARIANTS ESPECÍFICAS
// ============================================================================

export function PrimaryIcon(props: Omit<IconProps, 'color'>) {
  return <Icon {...props} color="primary" />;
}

export function SecondaryIcon(props: Omit<IconProps, 'color'>) {
  return <Icon {...props} color="secondary" />;
}

export function SuccessIcon(props: Omit<IconProps, 'color'>) {
  return <Icon {...props} color="success" />;
}

export function WarningIcon(props: Omit<IconProps, 'color'>) {
  return <Icon {...props} color="warning" />;
}

export function ErrorIcon(props: Omit<IconProps, 'color'>) {
  return <Icon {...props} color="error" />;
}

export function InfoIcon(props: Omit<IconProps, 'color'>) {
  return <Icon {...props} color="info" />;
}

// ============================================================================
// ÍCONES PREDEFINIDOS
// ============================================================================

export function UserIcon(props: Omit<IconProps, 'name'>) {
  return <Icon {...props} name="user" />;
}

export function SettingsIcon(props: Omit<IconProps, 'name'>) {
  return <Icon {...props} name="settings" />;
}

export function NotificationIcon(props: Omit<IconProps, 'name'>) {
  return <Icon {...props} name="notification" />;
}

export function SearchIcon(props: Omit<IconProps, 'name'>) {
  return <Icon {...props} name="search" />;
}

export function MenuIcon(props: Omit<IconProps, 'name'>) {
  return <Icon {...props} name="menu" />;
}

export function CloseIcon(props: Omit<IconProps, 'name'>) {
  return <Icon {...props} name="close" />;
}

export function ArrowRightIcon(props: Omit<IconProps, 'name'>) {
  return <Icon {...props} name="arrow-right" />;
}

export function ArrowLeftIcon(props: Omit<IconProps, 'name'>) {
  return <Icon {...props} name="arrow-left" />;
}

export function ArrowUpIcon(props: Omit<IconProps, 'name'>) {
  return <Icon {...props} name="arrow-up" />;
}

export function ArrowDownIcon(props: Omit<IconProps, 'name'>) {
  return <Icon {...props} name="arrow-down" />;
}

export function CheckIcon(props: Omit<IconProps, 'name'>) {
  return <Icon {...props} name="check" />;
}

export function PlusIcon(props: Omit<IconProps, 'name'>) {
  return <Icon {...props} name="plus" />;
}

export function MinusIcon(props: Omit<IconProps, 'name'>) {
  return <Icon {...props} name="minus" />;
}

export function EditIcon(props: Omit<IconProps, 'name'>) {
  return <Icon {...props} name="edit" />;
}

export function DeleteIcon(props: Omit<IconProps, 'name'>) {
  return <Icon {...props} name="delete" />;
}

export function SaveIcon(props: Omit<IconProps, 'name'>) {
  return <Icon {...props} name="save" />;
}

export function HomeIcon(props: Omit<IconProps, 'name'>) {
  return <Icon {...props} name="home" />;
}

export function TasksIcon(props: Omit<IconProps, 'name'>) {
  return <Icon {...props} name="tasks" />;
}

export function NotesIcon(props: Omit<IconProps, 'name'>) {
  return <Icon {...props} name="notes" />;
}

export function HabitsIcon(props: Omit<IconProps, 'name'>) {
  return <Icon {...props} name="habits" />;
}

export function FinancesIcon(props: Omit<IconProps, 'name'>) {
  return <Icon {...props} name="finances" />;
}

