import React from 'react';

export const Habits: React.FC = () => {
  return (
    <div>
      <h1 className='text-2xl font-bold text-gray-900'>Hábitos</h1>
      <p className='mt-2 text-gray-600'>Rastreie seus hábitos.</p>

      <div className='mt-8'>
        <div className='bg-white shadow rounded-lg'>
          <div className='px-4 py-5 sm:p-6'>
            <h3 className='text-lg leading-6 font-medium text-gray-900'>
              Rastreamento de Hábitos
            </h3>
            <div className='mt-4'>
              <p className='text-sm text-gray-500'>
                Seus hábitos aparecerão aqui. Funcionalidade em desenvolvimento.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
