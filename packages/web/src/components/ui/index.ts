/**
 * UI Components - Jarvi Web
 * 
 * Exporta todos os componentes UI para web
 */

// ============================================================================
// BUTTON COMPONENTS
// ============================================================================

export {
  Button,
  type ButtonProps,
} from './Button';

// ============================================================================
// INPUT COMPONENTS
// ============================================================================

export {
  Input,
  type InputProps,
} from './Input';

// ============================================================================
// CARD COMPONENTS
// ============================================================================

export {
  Card,
  type CardProps,
} from './Card';


// ============================================================================
// FORM COMPONENTS
// ============================================================================

export {
  Textarea,
  type TextareaProps,
} from './Textarea';

export {
  Select,
  type SelectProps,
  type SelectOption,
} from './Select';

// ============================================================================
// LAYOUT COMPONENTS
// ============================================================================

export {
  Modal,
  type ModalProps,
} from './Modal';

export {
  Accordion,
  type AccordionProps,
} from './Accordion';

export {
  CategoryDropdown,
  type CategoryDropdownProps,
} from './CategoryDropdown';

// ============================================================================
// DISPLAY COMPONENTS
// ============================================================================

export {
  Badge,
  type BadgeProps,
} from './Badge';

// ============================================================================
// NOTIFICATION COMPONENTS
// ============================================================================

export {
  ToastProvider,
  useToast,
  toast,
  setGlobalToast,
} from './Sonner';
