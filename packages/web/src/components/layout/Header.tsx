import { Sticker, Wallet, Tag, Trophy, CheckCircle, User, SignOut } from '@phosphor-icons/react';
import { ThemeToggle } from "./ThemeToggle"
import jarviLogo from '../../assets/jarvi.svg';
import { useAuth } from "../../contexts/AuthContext";
import { useDialog } from "../../contexts/DialogContext";
import { Button } from "../ui";

const navigation = [
    { name: 'Tarefas', href: '/', icon: CheckCircle },
    { name: 'Notas', href: '/notes', icon: Sticker },
    { name: 'Finanças', href: '/finances', icon: Wallet },
    { name: 'Hábitos', href: '/habits', icon: Trophy },
    { name: 'Categorias', href: '/categories', icon: Tag },
  ];

export const Header = () => {
  const { user, logout } = useAuth();
  const { openDialog } = useDialog(); //

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  return (
    <>
      {/* Logo */}
      <div className='absolute top-6 left-6 z-[99999] flex items-center space-x-2'>
        <img src={jarviLogo} alt="Jarvi Logo" className='w-8 h-8 dark:invert dark:brightness-0 dark:contrast-100' />
        <h1 className='text-xl font-semibold text-white'>Jarvi</h1>
      </div>

      {/* Header */}
      <div className='absolute top-6 right-6 z-[99999] bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg p-4'>
        {/* Horizontal Navigation */}
        <div className='flex items-center space-x-4'>
        <nav className='flex gap-2'>
          {navigation.map(item => (
            <Button
              key={item.name}
              variant="secondary"
              size="small"
              icon={item.icon}
              iconPosition="left"
              onClick={() => openDialog(item.href.replace('/', '') || 'tasks')}
            >
              {item.name}
            </Button>
          ))}
        </nav>

          {/* User info and controls */}
          <div className='flex items-center space-x-4'>
            <ThemeToggle size="sm" />
            
            {/* User info */}
            <div className='flex items-center space-x-3'>
              <div className='flex items-center space-x-2'>
                {user?.avatar ? (
                  <img 
                    className='h-8 w-8 rounded-full' 
                    src={user.avatar} 
                    alt={user.name}
                  />
                ) : (
                  <User className='h-8 w-8 text-gray-400 dark:text-gray-500' />
                )}
                <div className='hidden lg:block'>
                  <p className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                    {user?.name || 'Usuário'}
                  </p>
                  <p className='text-xs text-gray-500 dark:text-gray-400'>
                    {user?.email}
                  </p>
                </div>
              </div>
              
          <Button
            variant="destructive"
            size="small"
            icon={SignOut}
            iconPosition="left"
            onClick={handleLogout}
            className='hidden sm:flex'
          >
            Sair
          </Button>
            </div>
          </div>
        </div>
      </div>
    </> 
  );
};