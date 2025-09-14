/**
 * Button Component - Jarvi Web
 * 
 * Componente Button otimizado para web com design tokens e suporte a ícones Phosphor
 */

import React from 'react';
import { useThemeClasses } from '../../hooks/useTheme';
import { IconProps } from 'phosphor-react';

// ============================================================================
// TIPOS
// ============================================================================

// Tipo para ícones Phosphor
type PhosphorIcon = React.ComponentType<IconProps>;

export interface ButtonProps {
  children?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  disabled?: boolean;
  loading?: boolean;
  // Suporte a ícones Phosphor
  icon?: PhosphorIcon;
  iconPosition?: 'left' | 'right' | 'icon-only';
  // Acessibilidade
  ariaLabel?: string;
  onClick?: () => void;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
}

// ============================================================================
// COMPONENTE
// ============================================================================

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  disabled = false,
  loading = false,
  icon: Icon,
  iconPosition = 'left',
  ariaLabel,
  onClick,
  className = '',
  type = 'button',
}: ButtonProps) {
  const { isDark } = useThemeClasses();

  // Validação para icon-only
  if (iconPosition === 'icon-only' && !ariaLabel) {
    console.warn('Button com icon-only deve ter ariaLabel para acessibilidade');
  }

  // Classes base
  const baseClasses = [
    'inline-flex items-center justify-center font-medium rounded-lg border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2',
    fullWidth ? 'w-full' : '',
    disabled || loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
    className,
  ].filter(Boolean).join(' ');

  // Classes de tamanho (usando tokens de spacing)
  const sizeClasses = {
    sm: 'px-2 py-1 text-sm', // spacing.2 (8px), spacing.1 (4px)
    md: 'px-3 py-2 text-base', // spacing.3 (12px), spacing.2 (8px)
    lg: 'px-4 py-3 text-lg', // spacing.4 (16px), spacing.3 (12px)
  };

  // Tamanhos de ícones baseados no tamanho do botão
  const iconSizes = {
    sm: 16, // 16px
    md: 20, // 20px
    lg: 24, // 24px
  };

  // Espaçamento entre ícone e texto
  const iconSpacing = {
    sm: 'mr-1', // spacing.1 (4px)
    md: 'mr-2', // spacing.2 (8px)
    lg: 'mr-3', // spacing.3 (12px)
  };

  // Classes para icon-only
  const iconOnlyClasses = {
    sm: 'p-2', // spacing.2 (8px) em todos os lados
    md: 'p-3', // spacing.3 (12px) em todos os lados
    lg: 'p-4', // spacing.4 (16px) em todos os lados
  };

  // Classes de variante
  const variantClasses = {
    primary: isDark 
      ? 'bg-blue-950 border-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500' 
      : 'bg-blue-950 border-blue-500 text-white hover:bg-blue-600 focus:ring-blue-500',
    secondary: isDark 
      ? 'bg-purple-600 border-purple-600 text-white hover:bg-purple-700 focus:ring-purple-500' 
      : 'bg-purple-500 border-purple-500 text-white hover:bg-purple-600 focus:ring-purple-500',
    outline: isDark 
      ? 'bg-transparent border-gray-600 text-gray-100 hover:bg-gray-700 focus:ring-gray-500' 
      : 'bg-transparent border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-gray-500',
    ghost: isDark 
      ? 'bg-transparent border-transparent text-gray-100 hover:bg-gray-700 focus:ring-gray-500' 
      : 'bg-transparent border-transparent text-gray-700 hover:bg-gray-50 focus:ring-gray-500',
    danger: isDark 
      ? 'bg-red-600 border-red-600 text-white hover:bg-red-700 focus:ring-red-500' 
      : 'bg-red-500 border-red-500 text-white hover:bg-red-600 focus:ring-red-500',
  };

  // Determinar classes de tamanho baseado na posição do ícone
  const getSizeClasses = () => {
    if (iconPosition === 'icon-only') {
      return iconOnlyClasses[size];
    }
    return sizeClasses[size];
  };

  // Classes finais
  const buttonClasses = [
    baseClasses,
    getSizeClasses(),
    variantClasses[variant],
  ].join(' ');

  // Renderizar ícone
  const renderIcon = (position: 'left' | 'right') => {
    if (!Icon || iconPosition !== position) return null;
    
    const spacingClass = position === 'left' ? iconSpacing[size] : `ml-${size === 'sm' ? '1' : size === 'md' ? '2' : '3'}`;
    
    return (
      <Icon 
        size={iconSizes[size]} 
        className={spacingClass}
        aria-hidden="true"
      />
    );
  };

  return (
    <button
      type={type}
      className={buttonClasses}
      onClick={onClick}
      disabled={disabled || loading}
      aria-label={iconPosition === 'icon-only' ? ariaLabel : undefined}
    >
      {loading ? (
        <>
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          {iconPosition !== 'icon-only' && children}
        </>
      ) : (
        <>
          {renderIcon('left')}
          {iconPosition !== 'icon-only' && children}
          {renderIcon('right')}
        </>
      )}
    </button>
  );
}

// ============================================================================
// COMPONENTES ESPECÍFICOS
// ============================================================================

export function PrimaryButton(props: Omit<ButtonProps, 'variant'>) {
  return <Button {...props} variant="primary" />;
}

export function SecondaryButton(props: Omit<ButtonProps, 'variant'>) {
  return <Button {...props} variant="secondary" />;
}

export function OutlineButton(props: Omit<ButtonProps, 'variant'>) {
  return <Button {...props} variant="outline" />;
}

export function GhostButton(props: Omit<ButtonProps, 'variant'>) {
  return <Button {...props} variant="ghost" />;
}

export function DangerButton(props: Omit<ButtonProps, 'variant'>) {
  return <Button {...props} variant="danger" />;
}

// ============================================================================
// COMPONENTES COM ÍCONES
// ============================================================================

// Botão com ícone à esquerda
export function ButtonWithLeftIcon(props: Omit<ButtonProps, 'iconPosition'>) {
  return <Button {...props} iconPosition="left" />;
}

// Botão com ícone à direita
export function ButtonWithRightIcon(props: Omit<ButtonProps, 'iconPosition'>) {
  return <Button {...props} iconPosition="right" />;
}

// Botão apenas com ícone
export function IconOnlyButton(props: Omit<ButtonProps, 'iconPosition' | 'children'>) {
  return <Button {...props} iconPosition="icon-only" />;
}

// ============================================================================
// EXEMPLOS DE USO
// ============================================================================

/*
// Exemplos de uso com ícones Phosphor:

import { Plus, ArrowRight, Edit, Trash, Save, Search, User, Settings } from 'phosphor-react';

// Botão com ícone à esquerda
<Button icon={Plus} iconPosition="left">
  Adicionar Item
</Button>

// Botão com ícone à direita
<Button icon={ArrowRight} iconPosition="right">
  Próximo
</Button>

// Botão apenas com ícone
<Button 
  icon={Edit} 
  iconPosition="icon-only"
  ariaLabel="Editar item"
  variant="ghost"
  size="medium"
/>

// Botão de perigo com ícone
<Button 
  icon={Trash} 
  iconPosition="left"
  variant="danger"
>
  Excluir
</Button>

// Botão de salvar
<Button 
  icon={Save} 
  iconPosition="left"
  variant="primary"
  size="large"
>
  Salvar Alterações
</Button>

// Botão de busca
<Button 
  icon={Search} 
  iconPosition="icon-only"
  ariaLabel="Buscar"
  variant="outline"
/>

// Botão de perfil
<Button 
  icon={User} 
  iconPosition="left"
  variant="secondary"
>
  Meu Perfil
</Button>

// Botão de configurações
<Button 
  icon={Settings} 
  iconPosition="icon-only"
  ariaLabel="Configurações"
  variant="ghost"
  size="small"
/>
*/