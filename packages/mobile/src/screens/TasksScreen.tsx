import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';
import { authService } from '../services/authService';

interface Task {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  priority?: string;
  due_date?: string;
}

export const TasksScreen: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');

  // Check authentication and load tasks
  useEffect(() => {
    checkAuthAndLoadTasks();
  }, []);

  const checkAuthAndLoadTasks = async () => {
    try {
      const isAuth = await authService.isAuthenticated();
      setIsAuthenticated(isAuth);
      
      if (isAuth) {
        await authService.initializeAuth();
        await loadTasks();
      }
    } catch (error) {
      console.error('Auth check error:', error);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const loadTasks = async () => {
    try {
      setIsLoading(true);
      const response = await api.get('/tasks');
      setTasks(response.data || []);
    } catch (error) {
      console.error('Error loading tasks:', error);
      Alert.alert('Erro', 'Não foi possível carregar as tarefas');
    } finally {
      setIsLoading(false);
    }
  };

  const openModal = (task?: Task) => {
    if (task) {
      // Editando tarefa existente
      setEditingTask(task);
      setTaskTitle(task.title);
      setTaskDescription(task.description);
    } else {
      // Criando nova tarefa
      setEditingTask(null);
      setTaskTitle('');
      setTaskDescription('');
    }
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingTask(null);
    setTaskTitle('');
    setTaskDescription('');
  };

  const saveTask = async () => {
    if (!taskTitle.trim()) {
      Alert.alert('Erro', 'O título da tarefa é obrigatório');
      return;
    }

    try {
      setIsLoading(true);
      
      if (editingTask) {
        // Editando tarefa existente
        const response = await api.put(`/tasks/${editingTask.id}`, {
          title: taskTitle.trim(),
          description: taskDescription.trim(),
        });
        
        setTasks(tasks.map(task => 
          task.id === editingTask.id ? response.data : task
        ));
      } else {
        // Criando nova tarefa
        const response = await api.post('/tasks', {
          title: taskTitle.trim(),
          description: taskDescription.trim(),
        });
        
        setTasks([...tasks, response.data]);
      }

      closeModal();
    } catch (error) {
      console.error('Error saving task:', error);
      Alert.alert('Erro', 'Não foi possível salvar a tarefa');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteTask = (taskId: string) => {
    Alert.alert(
      'Confirmar exclusão',
      'Tem certeza que deseja excluir esta tarefa?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/tasks/${taskId}`);
              setTasks(tasks.filter(task => task.id !== taskId));
            } catch (error) {
              console.error('Error deleting task:', error);
              Alert.alert('Erro', 'Não foi possível excluir a tarefa');
            }
          }
        }
      ]
    );
  };

  const toggleTaskCompletion = async (taskId: string) => {
    try {
      const response = await api.patch(`/tasks/${taskId}/toggle`);
      const updatedTask = response.data;
      
      // Atualizar a lista de tarefas com reordenação
      setTasks(prevTasks => {
        const updatedTasks = prevTasks.map(task =>
          task.id === taskId ? updatedTask : task
        );
        
        // Se a tarefa foi marcada como concluída, movê-la para o final
        if (updatedTask.completed) {
          const taskIndex = updatedTasks.findIndex(task => task.id === taskId);
          if (taskIndex !== -1) {
            const taskToMove = updatedTasks[taskIndex];
            const remainingTasks = updatedTasks.filter(task => task.id !== taskId);
            return [...remainingTasks, taskToMove];
          }
        }
        // Se a tarefa foi desmarcada como concluída, movê-la para o início das não concluídas
        else {
          const taskIndex = updatedTasks.findIndex(task => task.id === taskId);
          if (taskIndex !== -1) {
            const taskToMove = updatedTasks[taskIndex];
            const completedTasks = updatedTasks.filter(task => task.id !== taskId && task.completed);
            const incompleteTasks = updatedTasks.filter(task => task.id !== taskId && !task.completed);
            return [...incompleteTasks, taskToMove, ...completedTasks];
          }
        }
        
        return updatedTasks;
      });
    } catch (error) {
      console.error('Error toggling task:', error);
      Alert.alert('Erro', 'Não foi possível alterar o status da tarefa');
    }
  };

  // Show loading screen
  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Carregando tarefas...</Text>
      </View>
    );
  }

  // Show login message if not authenticated
  if (!isAuthenticated) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Ionicons name="lock-closed-outline" size={48} color="#6b7280" />
        <Text style={styles.notAuthText}>Faça login para ver suas tarefas</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Minhas Tarefas</Text>
      
      <ScrollView style={styles.taskList}>
        {tasks.map((task) => (
          <View key={task.id} style={styles.taskItem}>
            <TouchableOpacity 
              onPress={() => toggleTaskCompletion(task.id)}
              style={styles.checkboxContainer}
            >
              <Ionicons 
                name={task.completed ? 'checkmark-circle' : 'ellipse-outline'} 
                size={24} 
                color={task.completed ? '#10b981' : '#6b7280'} 
              />
            </TouchableOpacity>
            
            <View style={styles.taskContent}>
              <Text style={[
                styles.taskTitle,
                task.completed && styles.completedTask
              ]}>
                {task.title}
              </Text>
              {task.description && (
                <Text style={[
                  styles.taskDescription,
                  task.completed && styles.completedTask
                ]}>
                  {task.description}
                </Text>
              )}
            </View>

            <View style={styles.taskActions}>
              <TouchableOpacity 
                onPress={() => openModal(task)}
                style={styles.actionButton}
              >
                <Ionicons name="create-outline" size={20} color="#6366f1" />
              </TouchableOpacity>
              
              <TouchableOpacity 
                onPress={() => deleteTask(task.id)}
                style={styles.actionButton}
              >
                <Ionicons name="trash-outline" size={20} color="#ef4444" />
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
      
      <TouchableOpacity style={styles.addButton} onPress={() => openModal()}>
        <Ionicons name="add" size={24} color="#ffffff" />
        <Text style={styles.addButtonText}>Nova Tarefa</Text>
      </TouchableOpacity>

      {/* Modal para criar/editar tarefa */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingTask ? 'Editar Tarefa' : 'Nova Tarefa'}
            </Text>
            
            <TextInput
              style={styles.input}
              placeholder="Título da tarefa"
              value={taskTitle}
              onChangeText={setTaskTitle}
              maxLength={100}
            />
            
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Descrição (opcional)"
              value={taskDescription}
              onChangeText={setTaskDescription}
              multiline
              numberOfLines={4}
              maxLength={500}
            />
            
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={closeModal}>
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.saveButton} onPress={saveTask}>
                <Text style={styles.saveButtonText}>
                  {editingTask ? 'Salvar' : 'Criar'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
  },
  notAuthText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#1f2937',
  },
  taskList: {
    flex: 1,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  checkboxContainer: {
    marginRight: 12,
    marginTop: 2,
  },
  taskContent: {
    flex: 1,
    marginRight: 12,
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  taskDescription: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  completedTask: {
    textDecorationLine: 'line-through',
    color: '#9ca3af',
  },
  taskActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    padding: 8,
    marginLeft: 8,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366f1',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 20,
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
    backgroundColor: '#ffffff',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    marginRight: 8,
  },
  cancelButtonText: {
    color: '#6b7280',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#6366f1',
    marginLeft: 8,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
