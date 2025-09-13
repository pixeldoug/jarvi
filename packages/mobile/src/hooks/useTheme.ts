/**
 * Hook useTheme para Mobile - Jarvi Design System
 * 
 * Este hook integra o ThemeContext do design system com funcionalidades
 * específicas do React Native, como useColorScheme e AsyncStorage.
 */

import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme as useDesignSystemTheme } from '@jarvi/shared';
import { useEffect, useState } from 'react';

// ============================================================================
// TIPOS
// ============================================================================

interface UseThemeMobileOptions {
  storageKey?: string;
  enableSystemTheme?: boolean;
  enableSmoothTransition?: boolean;
}

// ============================================================================
// HOOK PRINCIPAL
// ============================================================================

/**
 * Hook para gerenciar tema na aplicação mobile
 */
export function useThemeMobile(options: UseThemeMobileOptions = {}) {
  const {
    storageKey = 'jarvi-theme',
    enableSystemTheme = true,
    enableSmoothTransition = true,
  } = options;

  const systemColorScheme = useColorScheme();
  const [isLoading, setIsLoading] = useState(true);

  const {
    theme,
    mode,
    toggleTheme,
    setTheme,
    isDark,
    isLight,
  } = useDesignSystemTheme();

  // Carregar tema salvo do AsyncStorage
  useEffect(() => {
    const loadStoredTheme = async () => {
      try {
        const storedTheme = await AsyncStorage.getItem(storageKey);
        if (storedTheme && (storedTheme === 'light' || storedTheme === 'dark')) {
          setTheme(storedTheme);
        } else if (enableSystemTheme && systemColorScheme) {
          setTheme(systemColorScheme);
        }
      } catch (error) {
        console.warn('Erro ao carregar tema do AsyncStorage:', error);
        if (enableSystemTheme && systemColorScheme) {
          setTheme(systemColorScheme);
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadStoredTheme();
  }, [storageKey, enableSystemTheme, systemColorScheme, setTheme]);

  // Salvar tema no AsyncStorage quando mudar
  useEffect(() => {
    if (!isLoading) {
      const saveTheme = async () => {
        try {
          await AsyncStorage.setItem(storageKey, mode);
        } catch (error) {
          console.warn('Erro ao salvar tema no AsyncStorage:', error);
        }
      };

      saveTheme();
    }
  }, [mode, storageKey, isLoading]);

  // Detectar mudanças no sistema
  useEffect(() => {
    if (enableSystemTheme && systemColorScheme && mode === 'system') {
      setTheme(systemColorScheme);
    }
  }, [systemColorScheme, enableSystemTheme, mode, setTheme]);

  return {
    theme,
    mode,
    toggleTheme,
    setTheme,
    isDark,
    isLight,
    isLoading,
    
    // Funcionalidades específicas do mobile
    storageKey,
    enableSystemTheme,
    systemColorScheme,
  };
}

// ============================================================================
// HOOKS ESPECÍFICOS
// ============================================================================

/**
 * Hook para obter apenas o tema atual
 */
export function useCurrentThemeMobile() {
  const { theme } = useThemeMobile();
  return theme;
}

/**
 * Hook para verificar se está no modo escuro
 */
export function useIsDarkMobile() {
  const { isDark } = useThemeMobile();
  return isDark;
}

/**
 * Hook para alternar tema
 */
export function useToggleThemeMobile() {
  const { toggleTheme } = useThemeMobile();
  return toggleTheme;
}

/**
 * Hook para obter estilos do tema
 */
export function useThemeStylesMobile() {
  const { theme } = useThemeMobile();
  
  return {
    // Backgrounds
    backgroundPrimary: { backgroundColor: theme.colors.background.primary },
    backgroundSecondary: { backgroundColor: theme.colors.background.secondary },
    backgroundTertiary: { backgroundColor: theme.colors.background.tertiary },
    
    // Surfaces
    surfacePrimary: { backgroundColor: theme.colors.surface.primary },
    surfaceSecondary: { backgroundColor: theme.colors.surface.secondary },
    surfaceTertiary: { backgroundColor: theme.colors.surface.tertiary },
    surfaceElevated: { backgroundColor: theme.colors.surface.elevated },
    
    // Text
    textPrimary: { color: theme.colors.text.primary },
    textSecondary: { color: theme.colors.text.secondary },
    textTertiary: { color: theme.colors.text.tertiary },
    textInverse: { color: theme.colors.text.inverse },
    textDisabled: { color: theme.colors.text.disabled },
    
    // Borders
    borderPrimary: { borderColor: theme.colors.border.primary },
    borderSecondary: { borderColor: theme.colors.border.secondary },
    borderFocus: { borderColor: theme.colors.border.focus },
    borderError: { borderColor: theme.colors.border.error },
    
    // Brand
    brandPrimary: { backgroundColor: theme.colors.brand.primary },
    brandSecondary: { backgroundColor: theme.colors.brand.secondary },
    
    // Semantic
    semanticSuccess: { backgroundColor: theme.colors.semantic.success },
    semanticWarning: { backgroundColor: theme.colors.semantic.warning },
    semanticError: { backgroundColor: theme.colors.semantic.error },
    semanticInfo: { backgroundColor: theme.colors.semantic.info },
  };
}

// ============================================================================
// UTILITÁRIOS
// ============================================================================

/**
 * Função para obter tema do AsyncStorage
 */
export async function getStoredThemeMobile(storageKey: string = 'jarvi-theme'): Promise<'light' | 'dark' | null> {
  try {
    const stored = await AsyncStorage.getItem(storageKey);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    return null;
  }
}

/**
 * Função para salvar tema no AsyncStorage
 */
export async function setStoredThemeMobile(mode: 'light' | 'dark', storageKey: string = 'jarvi-theme'): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey, mode);
  } catch (error) {
    console.warn('Erro ao salvar tema no AsyncStorage:', error);
  }
}

/**
 * Função para detectar preferência do sistema
 */
export function getSystemThemeMobile(): 'light' | 'dark' {
  const { useColorScheme } = require('react-native');
  const colorScheme = useColorScheme();
  return colorScheme === 'dark' ? 'dark' : 'light';
}

// ============================================================================
// EXPORTS
// ============================================================================

export default useThemeMobile;

