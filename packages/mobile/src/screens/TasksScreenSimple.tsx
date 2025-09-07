import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Task {
  id: string;
  title: string;
  completed: boolean;
}

export const TasksScreenSimple: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([
    { id: '1', title: 'Tarefa de exemplo 1', completed: false },
    { id: '2', title: 'Tarefa de exemplo 2', completed: true },
    { id: '3', title: 'Tarefa de exemplo 3', completed: false },
  ]);
  
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleAddTask = () => {
    if (newTaskTitle.trim()) {
      const newTask: Task = {
        id: Date.now().toString(),
        title: newTaskTitle.trim(),
        completed: false,
      };
      setTasks([...tasks, newTask]);
      setNewTaskTitle('');
      setIsCreating(false);
      Alert.alert('Sucesso', 'Tarefa adicionada!');
    }
  };

  const toggleTask = (id: string) => {
    setTasks(tasks.map(task => 
      task.id === id 
        ? { ...task, completed: !task.completed }
        : task
    ));
  };

  const deleteTask = (id: string) => {
    Alert.alert(
      'Confirmar',
      'Deseja excluir esta tarefa?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Excluir', 
          style: 'destructive',
          onPress: () => setTasks(tasks.filter(task => task.id !== id))
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>📝 Minhas Tarefas</Text>
        <Text style={styles.subtitle}>
          {tasks.filter(t => !t.completed).length} pendentes, {tasks.filter(t => t.completed).length} concluídas
        </Text>
      </View>

      {/* Add Task Section */}
      {isCreating ? (
        <View style={styles.addTaskContainer}>
          <TextInput
            style={styles.input}
            placeholder="Digite o nome da tarefa..."
            value={newTaskTitle}
            onChangeText={setNewTaskTitle}
            autoFocus
          />
          <View style={styles.buttonRow}>
            <TouchableOpacity 
              style={[styles.button, styles.cancelButton]} 
              onPress={() => {
                setIsCreating(false);
                setNewTaskTitle('');
              }}
            >
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.button, styles.saveButton]} 
              onPress={handleAddTask}
            >
              <Text style={styles.saveButtonText}>Salvar</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity 
          style={styles.addButton} 
          onPress={() => setIsCreating(true)}
        >
          <Text style={styles.addButtonText}>➕ Adicionar Nova Tarefa</Text>
        </TouchableOpacity>
      )}

      {/* Tasks List */}
      <ScrollView style={styles.tasksList}>
        {tasks.map((task) => (
          <View key={task.id} style={styles.taskCard}>
            <TouchableOpacity 
              style={styles.taskContent}
              onPress={() => toggleTask(task.id)}
            >
              <Text style={styles.taskIcon}>
                {task.completed ? '✅' : '⭕'}
              </Text>
              <Text style={[
                styles.taskTitle,
                task.completed && styles.completedTask
              ]}>
                {task.title}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.deleteButton}
              onPress={() => deleteTask(task.id)}
            >
              <Text style={styles.deleteButtonText}>🗑️</Text>
            </TouchableOpacity>
          </View>
        ))}
        
        {tasks.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>📝</Text>
            <Text style={styles.emptyTitle}>Nenhuma tarefa ainda</Text>
            <Text style={styles.emptySubtitle}>Adicione sua primeira tarefa!</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    padding: 20,
    backgroundColor: '#6366f1',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#e5e7eb',
  },
  addTaskContainer: {
    margin: 16,
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f3f4f6',
  },
  saveButton: {
    backgroundColor: '#6366f1',
  },
  cancelButtonText: {
    color: '#6b7280',
    fontWeight: '600',
  },
  saveButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  addButton: {
    margin: 16,
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  addButtonText: {
    color: '#6366f1',
    fontSize: 16,
    fontWeight: '600',
  },
  tasksList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    marginBottom: 8,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  taskContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  taskIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  taskTitle: {
    fontSize: 16,
    color: '#1f2937',
    flex: 1,
  },
  completedTask: {
    textDecorationLine: 'line-through',
    color: '#9ca3af',
  },
  deleteButton: {
    padding: 8,
  },
  deleteButtonText: {
    fontSize: 18,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
});







