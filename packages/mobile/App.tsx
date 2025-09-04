import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, SafeAreaView } from 'react-native';
import { authService, User } from './src/services/authService';

// Import screens
import { HomeScreen } from './src/screens/HomeScreen';
import { TasksScreen } from './src/screens/TasksScreen';
import { NotesScreen } from './src/screens/NotesScreen';
import { HabitsScreen } from './src/screens/HabitsScreen';
import { FinancesScreen } from './src/screens/FinancesScreen';
import { BottomTabs } from './src/components/BottomTabs';

type Screen = 'home' | 'tasks' | 'notes' | 'habits' | 'finances';

const App = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userInfo, setUserInfo] = useState<User | null>(null);
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');

  // Check authentication status on app start
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const isAuth = await authService.isAuthenticated();
      if (isAuth) {
        const user = await authService.getUser();
        if (user) {
          setUserInfo(user);
          setIsAuthenticated(true);
          await authService.initializeAuth(); // Set up API headers
        }
      }
    } catch (error) {
      console.error('Auth check error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setIsLoading(true);
      
      const authData = await authService.signInWithGoogle();
      
      setUserInfo(authData.user);
      setIsAuthenticated(true);
      setCurrentScreen('home');
      
      Alert.alert(
        'Login Sucesso!', 
        `Bem-vindo, ${authData.user.name}!`
      );
    } catch (error) {
      console.error('Google sign-in error:', error);
      Alert.alert(
        'Erro', 
        `Falha no login com Google: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await authService.signOut();
      setIsAuthenticated(false);
      setUserInfo(null);
      setCurrentScreen('home');
      Alert.alert('Logout', 'Você foi desconectado');
    } catch (error) {
      console.error('Logout error:', error);
      Alert.alert('Erro', 'Erro ao fazer logout');
    }
  };

  const navigateToScreen = (screen: Screen) => {
    setCurrentScreen(screen);
  };

  // Show loading screen while checking authentication
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContent}>
          <Text style={styles.title}>Jarvi</Text>
          <Text style={styles.loadingText}>Carregando...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Show Main App with BottomTabs if authenticated
  if (isAuthenticated) {
    return (
      <View style={styles.container}>
        <HomeScreen 
          userInfo={userInfo} 
          onLogout={handleLogout}
          onNavigateToTasks={() => {}}
          onNavigateToNotes={() => {}}
          onNavigateToHabits={() => {}}
          onNavigateToFinances={() => {}}
        />
        <BottomTabs 
          userInfo={userInfo}
          onLogout={handleLogout}
        />
      </View>
    );
  }

  // Show Login Screen if not authenticated
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.loginContent}>
        <Text style={styles.title}>Jarvi</Text>
        <Text style={styles.subtitle}>Seu assistente de produtividade</Text>
        
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.googleButton}
            onPress={handleGoogleLogin}
            disabled={isLoading}
          >
            <Text style={styles.googleButtonText}>
              {isLoading ? 'Carregando...' : '🔐 Entrar com Google'}
            </Text>
          </TouchableOpacity>
        </View>
        
        <Text style={styles.footer}>
          Faça login com sua conta Google
        </Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#6366f1',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  backButton: {
    marginRight: 15,
  },
  backButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  loginContent: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  loadingContent: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#ffffff',
    textAlign: 'center',
    marginTop: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 60,
  },
  buttonContainer: {
    marginBottom: 40,
  },
  googleButton: {
    backgroundColor: '#4285f4',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  googleButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    textAlign: 'center',
    color: '#6b7280',
    fontSize: 14,
  },
});

export default App;
