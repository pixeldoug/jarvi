import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export const HabitsScreen: React.FC = () => {
  const habits = [
    { id: '1', title: 'Exercitar-se', streak: 5 },
    { id: '2', title: 'Ler 30 min', streak: 3 },
    { id: '3', title: 'Meditar', streak: 7 },
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Meus Objetivos</Text>
      
      <ScrollView style={styles.habitsList}>
        {habits.map((habit) => (
          <View key={habit.id} style={styles.habitItem}>
            <View style={styles.habitInfo}>
              <Text style={styles.habitTitle}>{habit.title}</Text>
              <Text style={styles.habitStreak}>{habit.streak} dias seguidos</Text>
            </View>
            <TouchableOpacity style={styles.checkButton}>
              <Ionicons name="checkmark" size={20} color="#ffffff" />
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
      
      <TouchableOpacity style={styles.addButton}>
        <Ionicons name="add" size={24} color="#ffffff" />
        <Text style={styles.addButtonText}>Novo Objetivo</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#1f2937',
  },
  habitsList: {
    flex: 1,
  },
  habitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    marginBottom: 12,
  },
  habitInfo: {
    flex: 1,
  },
  habitTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  habitStreak: {
    fontSize: 14,
    color: '#6b7280',
  },
  checkButton: {
    backgroundColor: '#10b981',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366f1',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 20,
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});
