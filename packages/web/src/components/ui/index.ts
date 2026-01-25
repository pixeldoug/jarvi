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
  PrimaryButton,
  SecondaryButton,
  GhostButton,
  DestructiveButton,
  type ButtonProps,
} from './Button';

export {
  UpgradeButton,
  type UpgradeButtonProps,
} from './UpgradeButton/UpgradeButton';

// ============================================================================
// INPUT COMPONENTS
// ============================================================================

export {
  TextInput,
  Input,
  type TextInputProps,
  type InputProps,
} from './TextInput/TextInput';

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
  TextArea,
  Textarea,
  type TextAreaProps,
  type TextareaProps,
} from './TextArea/TextArea';

export {
  TagInput,
  type TagInputProps,
  type Tag,
} from './TagInput/TagInput';

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
  Drawer,
  type DrawerProps,
} from './Drawer';

export {
  Dropdown,
  type DropdownProps,
} from './Dropdown/Dropdown';

export {
  Dialog,
  type DialogProps,
} from './Dialog/Dialog';

export {
  Accordion,
  type AccordionProps,
} from './Accordion';

export {
  Collapsible,
  type CollapsibleProps,
} from './Collapsible';


// ============================================================================
// DISPLAY COMPONENTS
// ============================================================================

export {
  Avatar,
  type AvatarProps,
} from './Avatar/Avatar';

export {
  Badge,
  type BadgeProps,
} from './Badge/Badge';

export {
  Chip,
  type ChipProps,
} from './Chip';

export {
  Loading,
} from './Loading';

export {
  Divider,
  type DividerProps,
} from './Divider';

export {
  Logo,
  type LogoProps,
} from './Logo';

export {
  Tooltip,
  type TooltipProps,
  type TooltipPosition,
} from './Tooltip';

// ============================================================================
// NAVIGATION COMPONENTS
// ============================================================================

export {
  ControlBar,
  type ControlBarProps,
  type TaskCreationData,
} from './ControlBar';

export {
  ListItem,
  type ListItemProps,
} from './ListItem';

// ============================================================================
// DATE & TIME COMPONENTS (Generic)
// ============================================================================

export {
  Calendar,
  type CalendarProps,
} from './Calendar';

// Note: TaskDatePicker and TaskTimePicker are in features/tasks/
// They are task-specific and not generic UI components

// ============================================================================
// NOTIFICATION COMPONENTS
// ============================================================================

export {
  ToastProvider,
  useToast,
  toast,
  setGlobalToast,
} from './Sonner';
