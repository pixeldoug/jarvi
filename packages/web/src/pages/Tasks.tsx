import React, { useState } from 'react';
import { useTasks } from '../contexts/TaskContext';
import { useAuth } from '../contexts/AuthContext';
import { Task, CreateTaskData } from '../contexts/TaskContext';
import { Button, Input, Textarea, Select, Modal, Card, Badge } from '../components/ui';
import { Edit, Trash2, Plus } from 'lucide-react';

export const Tasks: React.FC = () => {
  const { tasks, isLoading, error, createTask, updateTask, deleteTask, toggleTaskCompletion } = useTasks();
  const { user } = useAuth();
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formData, setFormData] = useState<CreateTaskData>({
    title: '',
    description: '',
    priority: 'medium',
    category: '',
    dueDate: '',
  });

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createTask(formData);
      setShowCreateModal(false);
      setFormData({ title: '', description: '', priority: 'medium', category: '', dueDate: '' });
    } catch (error) {
      console.error('Failed to create task:', error);
    }
  };

  const handleUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask) return;
    
    try {
      await updateTask(editingTask.id, formData);
      setEditingTask(null);
      setFormData({ title: '', description: '', priority: 'medium', category: '', dueDate: '' });
    } catch (error) {
      console.error('Failed to update task:', error);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (window.confirm('Are you sure you want to delete this task?')) {
      try {
        await deleteTask(taskId);
      } catch (error) {
        console.error('Failed to delete task:', error);
      }
    }
  };

  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setFormData({
      title: task.title,
      description: task.description || '',
      priority: task.priority,
      category: task.category || '',
      dueDate: task.due_date ? new Date(task.due_date).toISOString().split('T')[0] : '',
    });
  };

  const closeModals = () => {
    setShowCreateModal(false);
    setEditingTask(null);
    setFormData({ title: '', description: '', priority: 'medium', category: '', dueDate: '' });
  };

  const getPriorityVariant = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'danger';
      case 'high': return 'warning';
      case 'medium': return 'info';
      case 'low': return 'success';
      default: return 'default';
    }
  };

  const getPriorityLabel = (priority: string) => {
    const labels = {
      urgent: 'Urgente',
      high: 'Alta',
      medium: 'Média',
      low: 'Baixa',
    };
    return labels[priority as keyof typeof labels] || priority;
  };

  const priorityOptions = [
    { value: 'low', label: 'Baixa' },
    { value: 'medium', label: 'Média' },
    { value: 'high', label: 'Alta' },
    { value: 'urgent', label: 'Urgente' },
  ];

  if (!user) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">Por favor, faça login para ver suas tarefas.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Tarefas</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">Gerencie suas tarefas e mantenha-se organizado</p>
        </div>
        <Button
          onClick={() => setShowCreateModal(true)}
          leftIcon={<Plus className="w-4 h-4" />}
        >
          Nova Tarefa
        </Button>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-500 dark:text-gray-400">Carregando tarefas...</p>
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-400 dark:text-gray-500 text-6xl mb-4">📝</div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Nenhuma tarefa ainda</h3>
          <p className="text-gray-500 dark:text-gray-400">Crie sua primeira tarefa para começar!</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tasks.map((task) => (
            <Card
              key={task.id}
              className={`p-6 border-l-4 ${
                task.completed ? 'border-green-500 opacity-75' : 'border-blue-500'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <input
                      type="checkbox"
                      checked={task.completed}
                      onChange={() => toggleTaskCompletion(task.id)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded"
                    />
                    <h3 className={`font-medium ${task.completed ? 'line-through text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>
                      {task.title}
                    </h3>
                  </div>
                  
                  {task.description && (
                    <p className={`text-sm mb-3 ${task.completed ? 'text-gray-400 dark:text-gray-500' : 'text-gray-600 dark:text-gray-300'}`}>
                      {task.description}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2 mb-3">
                    <Badge variant={getPriorityVariant(task.priority)}>
                      {getPriorityLabel(task.priority)}
                    </Badge>
                    {task.category && (
                      <Badge variant="default">
                        {task.category}
                      </Badge>
                    )}
                  </div>

                  {task.due_date && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                      Vencimento: {new Date(task.due_date).toLocaleDateString('pt-BR')}
                    </p>
                  )}
                </div>

                <div className="flex space-x-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEditModal(task)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteTask(task.id)}
                    className="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Task Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={closeModals}
        title="Criar Nova Tarefa"
        size="md"
      >
        <form onSubmit={handleCreateTask} className="space-y-4">
          <Input
            label="Título"
            required
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="Digite o título da tarefa"
          />

          <Textarea
            label="Descrição"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Digite a descrição da tarefa"
            rows={3}
          />

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Prioridade"
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
              options={priorityOptions}
            />

            <Input
              label="Categoria"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              placeholder="Ex: Trabalho, Pessoal"
            />
          </div>

          <Input
            label="Data de Vencimento"
            type="date"
            value={formData.dueDate}
            onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
          />

          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={closeModals}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
            >
              Criar Tarefa
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Task Modal */}
      <Modal
        isOpen={!!editingTask}
        onClose={closeModals}
        title="Editar Tarefa"
        size="md"
      >
        <form onSubmit={handleUpdateTask} className="space-y-4">
          <Input
            label="Título"
            required
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="Digite o título da tarefa"
          />

          <Textarea
            label="Descrição"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Digite a descrição da tarefa"
            rows={3}
          />

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Prioridade"
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
              options={priorityOptions}
            />

            <Input
              label="Categoria"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              placeholder="Ex: Trabalho, Pessoal"
            />
          </div>

          <Input
            label="Data de Vencimento"
            type="date"
            value={formData.dueDate}
            onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
          />

          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={closeModals}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
            >
              Atualizar Tarefa
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
