/**
 * Design System Demo - Jarvi Mobile
 * 
 * Componente de demonstração do design system
 * para testar todos os componentes e funcionalidades.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
} from 'react-native';
import { useThemeMobile, useThemeStylesMobile } from '../../hooks/useTheme';
import { getTextStyle, getTitleStyle } from '../../config/fonts';
import { getThemeStyles } from '../../config/nativewind';

export function DesignSystemDemo() {
  const { isDark, toggleTheme } = useThemeMobile();
  const themeStyles = useThemeStylesMobile();
  const [inputValue, setInputValue] = useState('');

  return (
    <SafeAreaView style={[themeStyles.backgroundPrimary, { flex: 1 }]}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        
        {/* Header */}
        <View style={{ alignItems: 'center', marginBottom: 32 }}>
          <Text style={[getTitleStyle('4xl'), themeStyles.textPrimary]}>
            Jarvi Design System
          </Text>
          <Text style={[getTextStyle('lg'), themeStyles.textSecondary, { marginTop: 8 }]}>
            Demonstração completa do sistema de design
          </Text>
          
          {/* Theme Toggle */}
          <TouchableOpacity
            onPress={toggleTheme}
            style={[
              themeStyles.surfaceSecondary,
              {
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 8,
                marginTop: 16,
                borderWidth: 1,
                borderColor: isDark ? '#4b5563' : '#e5e7eb',
              }
            ]}
          >
            <Text style={[getTextStyle('sm'), themeStyles.textPrimary]}>
              {isDark ? '☀️ Modo Claro' : '🌙 Modo Escuro'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Theme Toggle Section */}
        <View style={[themeStyles.surfacePrimary, { padding: 16, borderRadius: 12, marginBottom: 16 }]}>
          <Text style={[getTitleStyle('2xl'), themeStyles.textPrimary, { marginBottom: 8 }]}>
            Theme Toggle
          </Text>
          <Text style={[getTextStyle('sm'), themeStyles.textSecondary, { marginBottom: 16 }]}>
            Teste o sistema de temas light/dark
          </Text>
          
          <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
            <TouchableOpacity
              onPress={toggleTheme}
              style={[
                themeStyles.brandPrimary,
                { padding: 12, borderRadius: 8, minWidth: 80, alignItems: 'center' }
              ]}
            >
              <Text style={[getTextStyle('sm'), themeStyles.textInverse]}>
                Toggle
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Buttons Section */}
        <View style={[themeStyles.surfacePrimary, { padding: 16, borderRadius: 12, marginBottom: 16 }]}>
          <Text style={[getTitleStyle('2xl'), themeStyles.textPrimary, { marginBottom: 8 }]}>
            Buttons
          </Text>
          <Text style={[getTextStyle('sm'), themeStyles.textSecondary, { marginBottom: 16 }]}>
            Todos os tipos de botões do design system
          </Text>
          
          <View style={{ gap: 12 }}>
            {/* Primary Button */}
            <TouchableOpacity
              style={[
                themeStyles.brandPrimary,
                { padding: 12, borderRadius: 8, alignItems: 'center' }
              ]}
            >
              <Text style={[getTextStyle('base'), themeStyles.textInverse]}>
                Primary Button
              </Text>
            </TouchableOpacity>
            
            {/* Secondary Button */}
            <TouchableOpacity
              style={[
                themeStyles.brandSecondary,
                { padding: 12, borderRadius: 8, alignItems: 'center' }
              ]}
            >
              <Text style={[getTextStyle('base'), themeStyles.textInverse]}>
                Secondary Button
              </Text>
            </TouchableOpacity>
            
            {/* Ghost Button */}
            <TouchableOpacity
              style={[
                themeStyles.surfaceSecondary,
                { padding: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: isDark ? '#4b5563' : '#e5e7eb' }
              ]}
            >
              <Text style={[getTextStyle('base'), themeStyles.textPrimary]}>
                Ghost Button
              </Text>
            </TouchableOpacity>
            
            {/* Danger Button */}
            <TouchableOpacity
              style={[
                themeStyles.semanticError,
                { padding: 12, borderRadius: 8, alignItems: 'center' }
              ]}
            >
              <Text style={[getTextStyle('base'), themeStyles.textInverse]}>
                Danger Button
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Inputs Section */}
        <View style={[themeStyles.surfacePrimary, { padding: 16, borderRadius: 12, marginBottom: 16 }]}>
          <Text style={[getTitleStyle('2xl'), themeStyles.textPrimary, { marginBottom: 8 }]}>
            Inputs
          </Text>
          <Text style={[getTextStyle('sm'), themeStyles.textSecondary, { marginBottom: 16 }]}>
            Componentes de input com diferentes tipos
          </Text>
          
          <View style={{ gap: 16 }}>
            {/* Text Input */}
            <View>
              <Text style={[getTextStyle('sm'), themeStyles.textPrimary, { marginBottom: 4 }]}>
                Text Input
              </Text>
              <TextInput
                style={[
                  themeStyles.surfaceSecondary,
                  themeStyles.textPrimary,
                  themeStyles.borderPrimary,
                  {
                    padding: 12,
                    borderRadius: 8,
                    borderWidth: 1,
                    fontSize: 16,
                  }
                ]}
                placeholder="Digite algo..."
                placeholderTextColor={isDark ? '#9ca3af' : '#6b7280'}
                value={inputValue}
                onChangeText={setInputValue}
              />
            </View>
            
            {/* Email Input */}
            <View>
              <Text style={[getTextStyle('sm'), themeStyles.textPrimary, { marginBottom: 4 }]}>
                Email Input
              </Text>
              <TextInput
                style={[
                  themeStyles.surfaceSecondary,
                  themeStyles.textPrimary,
                  themeStyles.borderPrimary,
                  {
                    padding: 12,
                    borderRadius: 8,
                    borderWidth: 1,
                    fontSize: 16,
                  }
                ]}
                placeholder="seu@email.com"
                placeholderTextColor={isDark ? '#9ca3af' : '#6b7280'}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
            
            {/* Password Input */}
            <View>
              <Text style={[getTextStyle('sm'), themeStyles.textPrimary, { marginBottom: 4 }]}>
                Password Input
              </Text>
              <TextInput
                style={[
                  themeStyles.surfaceSecondary,
                  themeStyles.textPrimary,
                  themeStyles.borderPrimary,
                  {
                    padding: 12,
                    borderRadius: 8,
                    borderWidth: 1,
                    fontSize: 16,
                  }
                ]}
                placeholder="Sua senha"
                placeholderTextColor={isDark ? '#9ca3af' : '#6b7280'}
                secureTextEntry
              />
            </View>
          </View>
        </View>

        {/* Cards Section */}
        <View style={{ gap: 16, marginBottom: 16 }}>
          <Text style={[getTitleStyle('2xl'), themeStyles.textPrimary, { marginBottom: 8 }]}>
            Cards
          </Text>
          
          {/* Card Default */}
          <View style={[themeStyles.surfacePrimary, { padding: 16, borderRadius: 12, borderWidth: 1, borderColor: isDark ? '#4b5563' : '#e5e7eb' }]}>
            <Text style={[getTitleStyle('lg'), themeStyles.textPrimary, { marginBottom: 8 }]}>
              Card Default
            </Text>
            <Text style={[getTextStyle('sm'), themeStyles.textSecondary, { marginBottom: 16 }]}>
              Card com estilo padrão do design system.
            </Text>
            <TouchableOpacity
              style={[
                themeStyles.brandPrimary,
                { padding: 8, borderRadius: 6, alignItems: 'center', alignSelf: 'flex-start' }
              ]}
            >
              <Text style={[getTextStyle('sm'), themeStyles.textInverse]}>
                Ação
              </Text>
            </TouchableOpacity>
          </View>

          {/* Card Elevated */}
          <View style={[
            themeStyles.surfaceElevated,
            {
              padding: 16,
              borderRadius: 12,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: isDark ? 0.3 : 0.1,
              shadowRadius: 4,
              elevation: 3,
            }
          ]}>
            <Text style={[getTitleStyle('lg'), themeStyles.textPrimary, { marginBottom: 8 }]}>
              Card Elevated
            </Text>
            <Text style={[getTextStyle('sm'), themeStyles.textSecondary, { marginBottom: 16 }]}>
              Este card tem uma sombra mais pronunciada para destacar o conteúdo.
            </Text>
            <TouchableOpacity
              style={[
                themeStyles.brandSecondary,
                { padding: 8, borderRadius: 6, alignItems: 'center', alignSelf: 'flex-start' }
              ]}
            >
              <Text style={[getTextStyle('sm'), themeStyles.textInverse]}>
                Ação
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Colors Section */}
        <View style={[themeStyles.surfacePrimary, { padding: 16, borderRadius: 12, marginBottom: 16 }]}>
          <Text style={[getTitleStyle('2xl'), themeStyles.textPrimary, { marginBottom: 8 }]}>
            Color Palette
          </Text>
          <Text style={[getTextStyle('sm'), themeStyles.textSecondary, { marginBottom: 16 }]}>
            Paleta de cores do design system
          </Text>
          
          <View style={{ gap: 16 }}>
            {/* Primary Colors */}
            <View>
              <Text style={[getTextStyle('sm'), themeStyles.textPrimary, { marginBottom: 8 }]}>
                Primary
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {[50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((shade) => (
                  <View
                    key={shade}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 6,
                      backgroundColor: `hsl(${200 + shade * 0.1}, 70%, ${50 + shade * 0.05}%)`,
                    }}
                  />
                ))}
              </View>
            </View>

            {/* Semantic Colors */}
            <View>
              <Text style={[getTextStyle('sm'), themeStyles.textPrimary, { marginBottom: 8 }]}>
                Semantic
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={[themeStyles.semanticSuccess, { width: 32, height: 32, borderRadius: 6 }]} />
                <View style={[themeStyles.semanticWarning, { width: 32, height: 32, borderRadius: 6 }]} />
                <View style={[themeStyles.semanticError, { width: 32, height: 32, borderRadius: 6 }]} />
                <View style={[themeStyles.semanticInfo, { width: 32, height: 32, borderRadius: 6 }]} />
              </View>
            </View>
          </View>
        </View>

        {/* Typography Section */}
        <View style={[themeStyles.surfacePrimary, { padding: 16, borderRadius: 12, marginBottom: 32 }]}>
          <Text style={[getTitleStyle('2xl'), themeStyles.textPrimary, { marginBottom: 8 }]}>
            Typography
          </Text>
          <Text style={[getTextStyle('sm'), themeStyles.textSecondary, { marginBottom: 16 }]}>
            Sistema tipográfico do design system
          </Text>
          
          <View style={{ gap: 12 }}>
            <Text style={[getTitleStyle('4xl'), themeStyles.textPrimary]}>Heading 1</Text>
            <Text style={[getTitleStyle('3xl'), themeStyles.textPrimary]}>Heading 2</Text>
            <Text style={[getTitleStyle('2xl'), themeStyles.textPrimary]}>Heading 3</Text>
            <Text style={[getTitleStyle('xl'), themeStyles.textPrimary]}>Heading 4</Text>
            <Text style={[getTitleStyle('lg'), themeStyles.textPrimary]}>Heading 5</Text>
            <Text style={[getTitleStyle('base'), themeStyles.textPrimary]}>Heading 6</Text>
            <Text style={[getTextStyle('base'), themeStyles.textPrimary]}>
              Este é um parágrafo normal com texto primário.
            </Text>
            <Text style={[getTextStyle('sm'), themeStyles.textSecondary]}>
              Este é um texto secundário menor.
            </Text>
            <Text style={[getTextStyle('xs'), themeStyles.textTertiary]}>
              Este é um texto terciário muito pequeno.
            </Text>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

