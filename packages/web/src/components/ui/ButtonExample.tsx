/**
 * Button Example Component
 * 
 * Exemplos de uso do Button com ícones Phosphor
 */

import { 
  Plus, 
  ArrowRight, 
  PencilSimple, 
  Trash, 
  FloppyDisk, 
  MagnifyingGlass, 
  User, 
  Gear,
  Heart,
  Download,
  Upload,
  Share
} from 'phosphor-react';
import { Button } from './Button';

export function ButtonExample() {
  return (
    <div className="p-8 space-y-8">
      <h2 className="text-2xl font-bold mb-6">Button Examples with Phosphor Icons</h2>
      
      {/* Botões com ícone à esquerda */}
      <section>
        <h3 className="text-lg font-semibold mb-4">Left Icon Buttons</h3>
        <div className="flex flex-wrap gap-4">
          <Button icon={Plus} iconPosition="left" variant="primary">
            Adicionar Item
          </Button>
          <Button icon={FloppyDisk} iconPosition="left" variant="secondary">
            Salvar
          </Button>
          <Button icon={Download} iconPosition="left" variant="outline">
            Download
          </Button>
          <Button icon={Heart} iconPosition="left" variant="ghost">
            Favoritar
          </Button>
          <Button icon={Trash} iconPosition="left" variant="danger">
            Excluir
          </Button>
        </div>
      </section>

      {/* Botões com ícone à direita */}
      <section>
        <h3 className="text-lg font-semibold mb-4">Right Icon Buttons</h3>
        <div className="flex flex-wrap gap-4">
          <Button icon={ArrowRight} iconPosition="right" variant="primary">
            Próximo
          </Button>
          <Button icon={Upload} iconPosition="right" variant="secondary">
            Upload
          </Button>
          <Button icon={Share} iconPosition="right" variant="outline">
            Compartilhar
          </Button>
          <Button icon={Gear} iconPosition="right" variant="ghost">
            Configurações
          </Button>
        </div>
      </section>

      {/* Botões apenas com ícone */}
      <section>
        <h3 className="text-lg font-semibold mb-4">Icon Only Buttons</h3>
        <div className="flex flex-wrap gap-4">
          <Button 
            icon={PencilSimple} 
            iconPosition="icon-only"
            ariaLabel="Editar item"
            variant="ghost"
            size="sm"
          />
          <Button 
            icon={MagnifyingGlass} 
            iconPosition="icon-only"
            ariaLabel="Buscar"
            variant="outline"
            size="md"
          />
          <Button 
            icon={User} 
            iconPosition="icon-only"
            ariaLabel="Perfil do usuário"
            variant="primary"
            size="lg"
          />
          <Button 
            icon={Gear} 
            iconPosition="icon-only"
            ariaLabel="Configurações"
            variant="secondary"
            size="md"
          />
          <Button 
            icon={Trash} 
            iconPosition="icon-only"
            ariaLabel="Excluir item"
            variant="danger"
            size="sm"
          />
        </div>
      </section>

      {/* Diferentes tamanhos */}
      <section>
        <h3 className="text-lg font-semibold mb-4">Different Sizes</h3>
        <div className="flex flex-wrap items-center gap-4">
          <Button icon={Plus} iconPosition="left" variant="primary" size="sm">
            Small
          </Button>
          <Button icon={Plus} iconPosition="left" variant="primary" size="md">
            Medium
          </Button>
          <Button icon={Plus} iconPosition="left" variant="primary" size="lg">
            Large
          </Button>
        </div>
      </section>

      {/* Estados */}
      <section>
        <h3 className="text-lg font-semibold mb-4">States</h3>
        <div className="flex flex-wrap gap-4">
          <Button icon={FloppyDisk} iconPosition="left" variant="primary">
            Normal
          </Button>
          <Button icon={FloppyDisk} iconPosition="left" variant="primary" disabled>
            Disabled
          </Button>
          <Button icon={FloppyDisk} iconPosition="left" variant="primary" loading>
            Loading
          </Button>
        </div>
      </section>

      {/* Full Width */}
      <section>
        <h3 className="text-lg font-semibold mb-4">Full Width</h3>
        <div className="space-y-4">
          <Button icon={Plus} iconPosition="left" variant="primary" fullWidth>
            Adicionar Novo Item
          </Button>
          <Button icon={FloppyDisk} iconPosition="left" variant="secondary" fullWidth>
            Salvar Todas as Alterações
          </Button>
        </div>
      </section>
    </div>
  );
}
