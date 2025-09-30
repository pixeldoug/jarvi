import React, { useState, useMemo } from 'react';
import { useTasks } from '../contexts/TaskContext';
import { MyLists } from '../components/features/lists';

export const Lists: React.FC = () => {
  const { tasks } = useTasks();
  const [selectedList, setSelectedList] = useState<{ type: 'important' | 'category'; category?: string } | null>(null);

  // Função para lidar com seleção de listas
  const handleListSelect = (listType: 'important' | 'category', category?: string) => {
    setSelectedList({ type: listType, category });
  };

  // Calcular contagens para as listas
  const listTaskCounts = useMemo(() => {
    const important = tasks.filter(task => task.important && !task.completed).length;
    const categories: Record<string, number> = {};
    
    tasks.forEach(task => {
      if (task.category && !task.completed) {
        categories[task.category] = (categories[task.category] || 0) + 1;
      }
    });
    
    return { important, categories };
  }, [tasks]);

  // Filtrar tarefas baseado na lista selecionada
  const filteredTasks = useMemo(() => {
    if (!selectedList) return [];
    
    if (selectedList.type === 'important') {
      return tasks.filter(task => task.important);
    }
    
    if (selectedList.type === 'category' && selectedList.category) {
      return tasks.filter(task => task.category === selectedList.category);
    }
    
    return [];
  }, [tasks, selectedList]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="flex">
        {/* Área principal */}
        <div className="flex-1 max-w-4xl mx-auto px-4 py-8">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              {selectedList 
                ? selectedList.type === 'important' 
                  ? 'Tarefas Importantes' 
                  : `Lista: ${selectedList.category}`
                : 'Minhas Listas'
              }
              {selectedList && (
                <button
                  onClick={() => setSelectedList(null)}
                  className="ml-3 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline"
                >
                  Voltar
                </button>
              )}
            </h1>
          </div>

          {selectedList ? (
            <div className="space-y-4">
              <p className="text-gray-600 dark:text-gray-400">
                {filteredTasks.length} tarefas encontradas
              </p>
              {filteredTasks.map(task => (
                <div key={task.id} className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center space-x-3">
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                      task.completed 
                        ? 'bg-green-500 border-green-500' 
                        : 'border-gray-300 dark:border-gray-600'
                    }`}>
                      {task.completed && (
                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    <span className={`flex-1 ${task.completed ? 'line-through text-gray-500' : 'text-gray-900 dark:text-gray-100'}`}>
                      {task.title}
                    </span>
                    {task.important && <span className="text-red-500">🔥</span>}
                    {task.category && (
                      <span className="text-xs bg-gray-200 dark:bg-gray-600 px-2 py-1 rounded">
                        {task.category}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Selecione uma lista no painel lateral para ver suas tarefas filtradas.
              </p>
            </div>
          )}
        </div>

        {/* Painel lateral direito - Minhas Listas */}
        <MyLists
          onListSelect={handleListSelect}
          selectedList={selectedList}
          taskCounts={listTaskCounts}
        />
      </div>
    </div>
  );
};
