import { useAuth } from '../context/AuthContext';

export function usePermissions() {
  const { permissionCodes = [] } = useAuth();

  const hasPermission = (code: string): boolean => {
    if (!code) return false;
    
    // Check wildcard (super-admin gets all permissions)
    if (permissionCodes.includes('*')) {
      return true;
    }

    const searchCode = code.toUpperCase().replace(':', '_');
    return permissionCodes.some(
      (c) => c.toUpperCase() === searchCode
    );
  };

  const canView = (module: string): boolean => {
    const modUpper = module.toUpperCase();
    return (
      hasPermission(`${modUpper}_VIEW`) ||
      hasPermission(`${modUpper}_VIEW_ALL`) ||
      hasPermission(`${modUpper}_VIEW_OPS`) ||
      hasPermission(`${modUpper}_VIEW_STOCK`) ||
      hasPermission(`${modUpper}_VIEW_PURCHASE`) ||
      hasPermission(`${modUpper}_VIEW_FINANCE`) ||
      hasPermission(`${modUpper}_VIEW_RESTAURANT`)
    );
  };

  const canCreate = (module: string): boolean => {
    return hasPermission(`${module.toUpperCase()}_CREATE`);
  };

  const canUpdate = (module: string): boolean => {
    const modUpper = module.toUpperCase();
    return hasPermission(`${modUpper}_EDIT`) || hasPermission(`${modUpper}_UPDATE`);
  };

  const canDelete = (module: string): boolean => {
    return hasPermission(`${module.toUpperCase()}_DELETE`);
  };

  const canApprove = (module: string): boolean => {
    return hasPermission(`${module.toUpperCase()}_APPROVE`);
  };

  return {
    hasPermission,
    canView,
    canCreate,
    canUpdate,
    canDelete,
    canApprove,
  };
}
