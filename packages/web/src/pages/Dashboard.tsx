import React from 'react';
import { Card } from '../components/ui';

export const Dashboard: React.FC = () => {
  return (
    <div>
      <h1 className='text-2xl font-bold text-gray-900 dark:text-gray-100'>Dashboard</h1>
      <p className='mt-2 text-gray-600 dark:text-gray-400'>Bem-vindo ao Jarvi!</p>

      <div className='mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4'>
        <Card className='p-5'>
          <div className='flex items-center'>
            <div className='flex-shrink-0'>
              <div className='w-8 h-8 bg-blue-500 rounded-md flex items-center justify-center'>
                <span className='text-white font-semibold'>T</span>
              </div>
            </div>
            <div className='ml-5 w-0 flex-1'>
              <dl>
                <dt className='text-sm font-medium text-gray-500 dark:text-gray-400 truncate'>
                  Tarefas Pendentes
                </dt>
                <dd className='text-lg font-medium text-gray-900 dark:text-gray-100'>12</dd>
              </dl>
            </div>
          </div>
        </Card>

        <Card className='p-5'>
          <div className='flex items-center'>
            <div className='flex-shrink-0'>
              <div className='w-8 h-8 bg-green-500 rounded-md flex items-center justify-center'>
                <span className='text-white font-semibold'>N</span>
              </div>
            </div>
            <div className='ml-5 w-0 flex-1'>
              <dl>
                <dt className='text-sm font-medium text-gray-500 dark:text-gray-400 truncate'>
                  Notas
                </dt>
                <dd className='text-lg font-medium text-gray-900 dark:text-gray-100'>8</dd>
              </dl>
            </div>
          </div>
        </Card>

        <Card className='p-5'>
          <div className='flex items-center'>
            <div className='flex-shrink-0'>
              <div className='w-8 h-8 bg-yellow-500 rounded-md flex items-center justify-center'>
                <span className='text-white font-semibold'>$</span>
              </div>
            </div>
            <div className='ml-5 w-0 flex-1'>
              <dl>
                <dt className='text-sm font-medium text-gray-500 dark:text-gray-400 truncate'>
                  Saldo
                </dt>
                <dd className='text-lg font-medium text-gray-900 dark:text-gray-100'>
                  R$ 2.450
                </dd>
              </dl>
            </div>
          </div>
        </Card>

        <Card className='p-5'>
          <div className='flex items-center'>
            <div className='flex-shrink-0'>
              <div className='w-8 h-8 bg-purple-500 rounded-md flex items-center justify-center'>
                <span className='text-white font-semibold'>H</span>
              </div>
            </div>
            <div className='ml-5 w-0 flex-1'>
              <dl>
                <dt className='text-sm font-medium text-gray-500 dark:text-gray-400 truncate'>
                  Hábitos Ativos
                </dt>
                <dd className='text-lg font-medium text-gray-900 dark:text-gray-100'>5</dd>
              </dl>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
