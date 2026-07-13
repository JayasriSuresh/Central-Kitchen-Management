import React from 'react';
import { usePermissions } from '../hooks/usePermissions';

interface CanProps {
  permission?: string;      // e.g. 'PRODUCT_FOOD_ITEM_CREATE'
  perform?: string;         // e.g. 'view', 'create', 'update', 'delete', 'approve'
  on?: string;              // module name, e.g. 'product_food_item'
  children: React.ReactNode;
}

export const Can: React.FC<CanProps> = ({ permission, perform, on, children }) => {
  const { hasPermission, canView, canCreate, canUpdate, canDelete, canApprove } = usePermissions();

  if (permission) {
    if (!hasPermission(permission)) return null;
  } else if (perform && on) {
    const action = perform.toLowerCase();
    if (action === 'view') {
      if (!canView(on)) return null;
    } else if (action === 'create') {
      if (!canCreate(on)) return null;
    } else if (action === 'update' || action === 'edit') {
      if (!canUpdate(on)) return null;
    } else if (action === 'delete') {
      if (!canDelete(on)) return null;
    } else if (action === 'approve') {
      if (!canApprove(on)) return null;
    } else {
      return null;
    }
  } else {
    return null;
  }

  return <>{children}</>;
};
