import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface UserInfo {
  name: string;
  email: string;
  avatar?: string;
}

interface HomeScreenProps {
  userInfo?: UserInfo;
  onLogout?: () => void;
  onNavigateToTasks?: () => void;
  onNavigateToNotes?: () => void;
  onNavigateToHabits?: () => void;
  onNavigateToFinances?: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ 
  userInfo, 
  onLogout,
  onNavigateToTasks,
  onNavigateToNotes,
  onNavigateToHabits,
  onNavigateToFinances
}) => {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.welcomeText}>🎉 Bem-vindo ao Jarvi!</Text>
          
          {userInfo && (
            <View style={styles.userInfo}>
              <Text style={styles.userName}>Olá, {userInfo.name}!</Text>
              <Text style={styles.userEmail}>{userInfo.email}</Text>
            </View>
          )}
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <Text style={styles.sectionTitle}>🚀 Ações Rápidas</Text>
          
          <View style={styles.actionGrid}>
            <TouchableOpacity 
              style={styles.actionCard} 
              onPress={onNavigateToTasks}
            >
              <Text style={styles.actionIcon}>📝</Text>
              <Text style={styles.actionTitle}>Tarefas</Text>
              <Text style={styles.actionSubtitle}>Gerencie suas tarefas</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.actionCard} 
              onPress={onNavigateToNotes}
            >
              <Text style={styles.actionIcon}>📓</Text>
              <Text style={styles.actionTitle}>Notas</Text>
              <Text style={styles.actionSubtitle}>Organize suas ideias</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.actionCard} 
              onPress={onNavigateToHabits}
            >
              <Text style={styles.actionIcon}>🔄</Text>
              <Text style={styles.actionTitle}>Hábitos</Text>
              <Text style={styles.actionSubtitle}>Construa rotinas</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.actionCard} 
              onPress={onNavigateToFinances}
            >
              <Text style={styles.actionIcon}>💰</Text>
              <Text style={styles.actionTitle}>Finanças</Text>
              <Text style={styles.actionSubtitle}>Controle seu dinheiro</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Quote */}
        <View style={styles.quoteContainer}>
          <Text style={styles.quote}>
            "Não é o que dizemos ou pensamos que nos define, mas o que fazemos."
          </Text>
          <Text style={styles.author}>- Jane Austen</Text>
        </View>

        {/* Logout Button */}
        {onLogout && (
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
              <Text style={styles.logoutButtonText}>🚪 Sair</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#6366f1',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  welcomeText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 20,
  },
  userInfo: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 20,
    borderRadius: 12,
    width: '100%',
  },
  userName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: '#e5e7eb',
  },
  quickActions: {
    marginBottom: 40,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 20,
    textAlign: 'center',
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 15,
  },
  actionCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    width: '47%',
    minHeight: 120,
    justifyContent: 'center',
  },
  actionIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
    textAlign: 'center',
  },
  actionSubtitle: {
    fontSize: 12,
    color: '#e5e7eb',
    textAlign: 'center',
    lineHeight: 16,
  },
  quoteContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  quote: {
    fontSize: 18,
    color: '#ffffff',
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 15,
    lineHeight: 26,
  },
  author: {
    fontSize: 14,
    color: '#e5e7eb',
    fontWeight: '500',
  },
  buttonContainer: {
    alignItems: 'center',
  },
  logoutButton: {
    backgroundColor: '#ef4444',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
