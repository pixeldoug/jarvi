/**
 * Design System Test Screen - Jarvi Mobile
 * 
 * Tela de teste para verificar se o sistema de design está funcionando
 * sem dependências do NativeWind por enquanto.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  StyleSheet,
} from 'react-native';
import { useThemeMobile, useThemeStylesMobile } from '../hooks/useTheme';
import { getTextStyle, getTitleStyle } from '../config/fonts';
import { getThemeStyles } from '../config/nativewind';

export function DesignSystemTestScreen() {
  const { isDark, toggleTheme } = useThemeMobile();
  const themeStyles = useThemeStylesMobile();
  const [inputValue, setInputValue] = useState('');

  // Estilos inline para teste
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? '#111827' : '#ffffff',
    },
    scrollContent: {
      padding: 16,
    },
    header: {
      alignItems: 'center',
      marginBottom: 32,
    },
    title: {
      fontSize: 32,
      fontWeight: 'bold',
      color: isDark ? '#f9fafb' : '#111827',
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 18,
      color: isDark ? '#d1d5db' : '#4b5563',
      textAlign: 'center',
      marginTop: 8,
    },
    themeToggle: {
      backgroundColor: isDark ? '#374151' : '#f9fafb',
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 8,
      marginTop: 16,
      borderWidth: 1,
      borderColor: isDark ? '#4b5563' : '#e5e7eb',
    },
    themeToggleText: {
      fontSize: 14,
      color: isDark ? '#f9fafb' : '#111827',
    },
    section: {
      backgroundColor: isDark ? '#1f2937' : '#ffffff',
      padding: 16,
      borderRadius: 12,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: isDark ? '#4b5563' : '#e5e7eb',
    },
    sectionTitle: {
      fontSize: 24,
      fontWeight: 'bold',
      color: isDark ? '#f9fafb' : '#111827',
      marginBottom: 8,
    },
    sectionSubtitle: {
      fontSize: 14,
      color: isDark ? '#d1d5db' : '#4b5563',
      marginBottom: 16,
    },
    button: {
      padding: 12,
      borderRadius: 8,
      alignItems: 'center',
      marginBottom: 12,
    },
    primaryButton: {
      backgroundColor: isDark ? '#7dd3fc' : '#0284c7',
    },
    secondaryButton: {
      backgroundColor: isDark ? '#d8b4fe' : '#9333ea',
    },
    ghostButton: {
      backgroundColor: isDark ? '#374151' : '#f9fafb',
      borderWidth: 1,
      borderColor: isDark ? '#4b5563' : '#e5e7eb',
    },
    dangerButton: {
      backgroundColor: isDark ? '#f87171' : '#ef4444',
    },
    buttonText: {
      fontSize: 16,
      color: '#ffffff',
      fontWeight: '600',
    },
    ghostButtonText: {
      fontSize: 16,
      color: isDark ? '#f9fafb' : '#111827',
      fontWeight: '600',
    },
    input: {
      backgroundColor: isDark ? '#374151' : '#f9fafb',
      padding: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: isDark ? '#4b5563' : '#e5e7eb',
      fontSize: 16,
      color: isDark ? '#f9fafb' : '#111827',
      marginBottom: 16,
    },
    inputLabel: {
      fontSize: 14,
      color: isDark ? '#f9fafb' : '#111827',
      marginBottom: 4,
    },
    colorPalette: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    colorSwatch: {
      width: 32,
      height: 32,
      borderRadius: 6,
    },
    typography: {
      marginBottom: 12,
    },
    heading1: {
      fontSize: 32,
      fontWeight: 'bold',
      color: isDark ? '#f9fafb' : '#111827',
    },
    heading2: {
      fontSize: 24,
      fontWeight: 'bold',
      color: isDark ? '#f9fafb' : '#111827',
    },
    heading3: {
      fontSize: 20,
      fontWeight: '600',
      color: isDark ? '#f9fafb' : '#111827',
    },
    bodyText: {
      fontSize: 16,
      color: isDark ? '#f9fafb' : '#111827',
    },
    secondaryText: {
      fontSize: 14,
      color: isDark ? '#d1d5db' : '#4b5563',
    },
    tertiaryText: {
      fontSize: 12,
      color: isDark ? '#9ca3af' : '#6b7280',
    },
  });

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}>
        
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Jarvi Design System</Text>
          <Text style={styles.subtitle}>
            Demonstração completa do sistema de design
          </Text>
          
          {/* Theme Toggle */}
          <TouchableOpacity onPress={toggleTheme} style={styles.themeToggle}>
            <Text style={styles.themeToggleText}>
              {isDark ? '☀️ Modo Claro' : '🌙 Modo Escuro'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Buttons Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Buttons</Text>
          <Text style={styles.sectionSubtitle}>
            Todos os tipos de botões do design system
          </Text>
          
          <TouchableOpacity style={[styles.button, styles.primaryButton]}>
            <Text style={styles.buttonText}>Primary Button</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={[styles.button, styles.secondaryButton]}>
            <Text style={styles.buttonText}>Secondary Button</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={[styles.button, styles.ghostButton]}>
            <Text style={styles.ghostButtonText}>Ghost Button</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={[styles.button, styles.dangerButton]}>
            <Text style={styles.buttonText}>Danger Button</Text>
          </TouchableOpacity>
        </View>

        {/* Inputs Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Inputs</Text>
          <Text style={styles.sectionSubtitle}>
            Componentes de input com diferentes tipos
          </Text>
          
          <Text style={styles.inputLabel}>Text Input</Text>
          <TextInput
            style={styles.input}
            placeholder="Digite algo..."
            placeholderTextColor={isDark ? '#9ca3af' : '#6b7280'}
            value={inputValue}
            onChangeText={setInputValue}
          />
          
          <Text style={styles.inputLabel}>Email Input</Text>
          <TextInput
            style={styles.input}
            placeholder="seu@email.com"
            placeholderTextColor={isDark ? '#9ca3af' : '#6b7280'}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          
          <Text style={styles.inputLabel}>Password Input</Text>
          <TextInput
            style={styles.input}
            placeholder="Sua senha"
            placeholderTextColor={isDark ? '#9ca3af' : '#6b7280'}
            secureTextEntry
          />
        </View>

        {/* Colors Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Color Palette</Text>
          <Text style={styles.sectionSubtitle}>
            Paleta de cores do design system
          </Text>
          
          <Text style={styles.inputLabel}>Primary Colors</Text>
          <View style={styles.colorPalette}>
            {[50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((shade) => (
              <View
                key={shade}
                style={[
                  styles.colorSwatch,
                  {
                    backgroundColor: `hsl(${200 + shade * 0.1}, 70%, ${50 + shade * 0.05}%)`,
                  }
                ]}
              />
            ))}
          </View>
          
          <Text style={[styles.inputLabel, { marginTop: 16 }]}>Semantic Colors</Text>
          <View style={styles.colorPalette}>
            <View style={[styles.colorSwatch, { backgroundColor: isDark ? '#6ee7b7' : '#10b981' }]} />
            <View style={[styles.colorSwatch, { backgroundColor: isDark ? '#fcd34d' : '#f59e0b' }]} />
            <View style={[styles.colorSwatch, { backgroundColor: isDark ? '#f87171' : '#ef4444' }]} />
            <View style={[styles.colorSwatch, { backgroundColor: isDark ? '#93c5fd' : '#3b82f6' }]} />
          </View>
        </View>

        {/* Typography Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Typography</Text>
          <Text style={styles.sectionSubtitle}>
            Sistema tipográfico do design system
          </Text>
          
          <View style={styles.typography}>
            <Text style={styles.heading1}>Heading 1</Text>
            <Text style={styles.heading2}>Heading 2</Text>
            <Text style={styles.heading3}>Heading 3</Text>
            <Text style={styles.bodyText}>
              Este é um parágrafo normal com texto primário.
            </Text>
            <Text style={styles.secondaryText}>
              Este é um texto secundário menor.
            </Text>
            <Text style={styles.tertiaryText}>
              Este é um texto terciário muito pequeno.
            </Text>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

