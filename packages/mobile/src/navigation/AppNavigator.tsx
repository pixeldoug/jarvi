import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Import screens
import { HomeScreen } from '../screens/HomeScreen';
import { TasksScreenSimple } from '../screens/TasksScreenSimple';

interface AppNavigatorProps {
  onLogout: () => void;
}

export const AppNavigator: React.FC<AppNavigatorProps> = ({ onLogout }) => {
  const [activeTab, setActiveTab] = useState('Home');

  const renderScreen = () => {
    switch (activeTab) {
      case 'Home':
        return <HomeScreen onLogout={onLogout} />;
      case 'Tasks':
        return <TasksScreenSimple />;
      case 'Notes':
        return (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
            <Text style={{ fontSize: 48, marginBottom: 16 }}>📄</Text>
            <Text style={{ fontSize: 18, fontWeight: '600', color: '#1f2937' }}>Notas</Text>
            <Text style={{ fontSize: 14, color: '#6b7280', marginTop: 8 }}>Em desenvolvimento...</Text>
          </View>
        );
      case 'Habits':
        return (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
            <Text style={{ fontSize: 48, marginBottom: 16 }}>🎯</Text>
            <Text style={{ fontSize: 18, fontWeight: '600', color: '#1f2937' }}>Hábitos</Text>
            <Text style={{ fontSize: 14, color: '#6b7280', marginTop: 8 }}>Em desenvolvimento...</Text>
          </View>
        );
      case 'Finances':
        return (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
            <Text style={{ fontSize: 48, marginBottom: 16 }}>💰</Text>
            <Text style={{ fontSize: 18, fontWeight: '600', color: '#1f2937' }}>Finanças</Text>
            <Text style={{ fontSize: 14, color: '#6b7280', marginTop: 8 }}>Em desenvolvimento...</Text>
          </View>
        );
      default:
        return <HomeScreen onLogout={onLogout} />;
    }
  };

  return (
    <View style={styles.container}>
      {/* Screen Content */}
      <View style={styles.screenContainer}>
        {renderScreen()}
      </View>
      
      {/* Bottom Tabs */}
      <SafeAreaView style={styles.tabBarContainer}>
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={styles.tab}
            onPress={() => setActiveTab('Home')}
          >
            <Text style={styles.tabIcon}>🏠</Text>
            <Text style={[
              styles.tabLabel,
              activeTab === 'Home' && styles.activeTabLabel
            ]}>Início</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.tab}
            onPress={() => setActiveTab('Tasks')}
          >
            <Text style={styles.tabIcon}>📝</Text>
            <Text style={[
              styles.tabLabel,
              activeTab === 'Tasks' && styles.activeTabLabel
            ]}>Tarefas</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.tab}
            onPress={() => setActiveTab('Notes')}
          >
            <Text style={styles.tabIcon}>📄</Text>
            <Text style={[
              styles.tabLabel,
              activeTab === 'Notes' && styles.activeTabLabel
            ]}>Notas</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.tab}
            onPress={() => setActiveTab('Habits')}
          >
            <Text style={styles.tabIcon}>🎯</Text>
            <Text style={[
              styles.tabLabel,
              activeTab === 'Habits' && styles.activeTabLabel
            ]}>Hábitos</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.tab}
            onPress={() => setActiveTab('Finances')}
          >
            <Text style={styles.tabIcon}>💰</Text>
            <Text style={[
              styles.tabLabel,
              activeTab === 'Finances' && styles.activeTabLabel
            ]}>Finanças</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  screenContainer: {
    flex: 1,
  },
  tabBarContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  tabBar: {
    flexDirection: 'row',
    paddingTop: 20,
    paddingBottom: 10,
    paddingHorizontal: 16,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  tabIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#9ca3af',
  },
  activeTabLabel: {
    color: '#6366f1',
  },
});
