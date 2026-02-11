import { useLocation, useNavigate } from 'react-router-dom';
import { ManagePlanDialog } from '../../components/features/subscription/ManagePlanDialog/ManagePlanDialog';

export default function SubscribePage() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleClose = () => {
    const state = location.state as { backgroundLocation?: unknown } | null;

    // If opened as a modal-route, close by going back to the background location.
    if (state?.backgroundLocation) {
      navigate(-1);
      return;
    }

    navigate('/tasks');
  };

  return (
    <ManagePlanDialog isOpen={true} onClose={handleClose} />
  );
}
