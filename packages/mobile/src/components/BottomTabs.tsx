import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { TasksScreen } from '../screens/TasksScreen';
import { NotesScreen } from '../screens/NotesScreen';
import { HabitsScreen } from '../screens/HabitsScreen';
import { FinancesScreen } from '../screens/FinancesScreen';

const { height: screenHeight } = Dimensions.get('window');
const EXPANDED_HEIGHT = screenHeight * 0.6; // 60% da tela

interface BottomTabsProps {
  userInfo?: {
    name: string;
    email: string;
    avatar?: string;
  };
  onLogout?: () => void;
}

export const BottomTabs: React.FC<BottomTabsProps> = ({ userInfo, onLogout }) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [activeScreen, setActiveScreen] = useState<string>('tasks');

  const openModal = (screenType: string) => {
    setActiveScreen(screenType);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
  };

  const handleLogout = () => {
    Alert.alert(
      'Sair',
      'Tem certeza que deseja sair?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Sair', 
          style: 'destructive',
          onPress: () => onLogout?.()
        }
      ]
    );
  };

  const getActiveScreen = () => {
    switch (activeScreen) {
      case 'tasks':
        return <TasksScreen />;
      case 'notes':
        return <NotesScreen />;
      case 'habits':
        return <HabitsScreen />;
      case 'finances':
        return <FinancesScreen />;
      default:
        return <TasksScreen />;
    }
  };

  const getScreenTitle = () => {
    switch (activeScreen) {
      case 'tasks':
        return 'Tarefas';
      case 'notes':
        return 'Notas';
      case 'habits':
        return 'Objetivos';
      case 'finances':
        return 'Finanças';
      default:
        return 'Tarefas';
    }
  };

  return (
    <>
      {/* Bottom Sheet */}
      {modalVisible && (
        <View style={styles.bottomSheet}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={styles.headerLeft}>
              <Text style={styles.sheetTitle}>{getScreenTitle()}</Text>
            </View>
            <View style={styles.headerRight}>
              {userInfo && (
                <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
                  <Ionicons name='log-out' size={20} color='#ef4444' />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={closeModal} style={styles.closeButton}>
                <Ionicons name='close' size={24} color='#6366f1' />
              </TouchableOpacity>
            </View>
          </View>

          {/* Content */}
          <ScrollView style={styles.sheetContent}>
            {getActiveScreen()}
          </ScrollView>
        </View>
      )}

      {/* Bottom Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity style={styles.tab} onPress={() => openModal('tasks')}>
          <Ionicons name='checkbox' size={24} color='#6366f1' />
          <Text style={styles.tabText}>Tarefas</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tab} onPress={() => openModal('notes')}>
          <Ionicons name='document-text' size={24} color='#6366f1' />
          <Text style={styles.tabText}>Notas</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tab}
          onPress={() => openModal('habits')}
        >
          <Ionicons name='flag' size={24} color='#6366f1' />
          <Text style={styles.tabText}>Objetivos</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tab}
          onPress={() => openModal('finances')}
        >
          <Ionicons name='card' size={24} color='#6366f1' />
          <Text style={styles.tabText}>Finanças</Text>
        </TouchableOpacity>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  bottomSheet: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    height: EXPANDED_HEIGHT,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    zIndex: 1,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  logoutButton: {
    padding: 5,
    marginRight: 10,
  },
  closeButton: {
    padding: 5,
  },
  sheetContent: {
    flex: 1,
    padding: 20,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 1)',
    paddingTop: 24,
    paddingBottom: 36,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    zIndex: 2,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  tabText: {
    fontSize: 12,
    color: '#6366f1',
    marginTop: 4,
    fontWeight: '500',
  },
});
