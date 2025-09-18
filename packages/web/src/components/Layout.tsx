import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  CheckCircle,
  Sticker,
  Wallet,
  Trophy,
  User,
  SignOut,
} from 'phosphor-react';
import { useAuth } from '../contexts/AuthContext';
import { ThemeToggle, Logo } from './ui';

const navigation = [
  { name: 'Tarefas', href: '/', icon: CheckCircle },
  { name: 'Notas', href: '/notes', icon: Sticker },
  { name: 'Finanças', href: '/finances', icon: Wallet },
  { name: 'Hábitos', href: '/habits', icon: Trophy },
];

export const Layout: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const location = useLocation();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  return (
    <div className='flex h-screen bg-gray-100 dark:bg-gray-900'>
      {/* Sidebar */}
      <div className='hidden md:flex md:flex-shrink-0'>
        <div className='flex flex-col w-64'>
          <div className='flex flex-col flex-grow pt-5 overflow-y-auto bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700'>
            <div className='flex items-center justify-between flex-shrink-0 px-4'>
              <div className='flex items-center space-x-2'>
                <Logo className='w-6 h-6 text-indigo-600 dark:text-indigo-400' />
                <h1 className='text-xl font-semibold text-gray-900 dark:text-gray-100'>Jarvi</h1>
              </div>
              <ThemeToggle size="sm" />
            </div>
            <div className='mt-5 flex-grow flex flex-col'>
              <nav className='flex-1 px-2 pb-4 space-y-1'>
                {navigation.map(item => {
                  const isActive = location.pathname === item.href;
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      className={`${
                        isActive
                          ? 'bg-indigo-100 dark:bg-indigo-900 border-indigo-500 text-indigo-700 dark:text-indigo-300'
                          : 'border-transparent text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100'
                      } group flex items-center px-2 py-2 text-sm font-medium border-r-2`}
                    >
                      <item.icon
                        className={`${
                          isActive
                            ? 'text-indigo-500 dark:text-indigo-400'
                            : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-400'
                        } mr-3 flex-shrink-0 h-6 w-6`}
                      />
                      {item.name}
                    </Link>
                  );
                })}
              </nav>
            </div>
            <div className='flex-shrink-0 flex border-t border-gray-200 dark:border-gray-700 p-4'>
              <div className='flex flex-col w-full space-y-3'>
                {/* User info */}
                <div className='flex items-center'>
                  <div className='flex-shrink-0'>
                    {user?.avatar ? (
                      <img 
                        className='h-8 w-8 rounded-full' 
                        src={user.avatar} 
                        alt={user.name}
                      />
                    ) : (
                      <User className='h-8 w-8 text-gray-400 dark:text-gray-500' />
                    )}
                  </div>
                  <div className='ml-3'>
                    <p className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                      {user?.name || 'Usuário'}
                    </p>
                    <p className='text-xs text-gray-500 dark:text-gray-400'>
                      {user?.email}
                    </p>
                  </div>
                </div>
                
                {/* Logout button */}
                <button
                  onClick={handleLogout}
                  className='flex items-center justify-center w-full px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 hover:border-red-300 dark:hover:border-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors'
                >
                  <SignOut className='h-4 w-4 mr-2' />
                  Sair
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className='flex flex-col w-0 flex-1 overflow-hidden'>
        <main className='flex-1 relative overflow-y-auto focus:outline-none bg-gray-50 dark:bg-gray-900'>
          <div className='py-6'>
            <div className='max-w-7xl mx-auto px-4 sm:px-6 md:px-8'>
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};
