/**
 * Role-Based Access Control (RBAC) Middleware
 * 
 * This middleware provides fine-grained permission control for API endpoints
 * based on user roles and permissions.
 */

const { AuthenticationError, ForbiddenError } = require('apollo-server-express');

// Define role hierarchy and permissions
const roles = {
  ADMIN: {
    inherits: ['MANAGER'],
    permissions: [
      'user:create',
      'user:delete',
      'user:manage-roles',
      'system:settings',
      'system:logs'
    ]
  },
  MANAGER: {
    inherits: ['USER'],
    permissions: [
      'conversation:create-group',
      'conversation:add-user',
      'conversation:remove-user',
      'meeting:create-all',
      'meeting:manage-all'
    ]
  },
  USER: {
    inherits: [],
    permissions: [
      'message:send',
      'message:read',
      'message:translate',
      'conversation:create-direct',
      'meeting:create-own',
      'meeting:join',
      'profile:edit-own'
    ]
  },
  GUEST: {
    inherits: [],
    permissions: [
      'message:read',
      'meeting:join'
    ]
  }
};

/**
 * Get all permissions for a role, including inherited permissions
 * @param {string} roleName - The role name
 * @returns {Array<string>} Array of permissions
 */
function getAllPermissions(roleName) {
  const role = roles[roleName];
  
  if (!role) {
    return [];
  }
  
  let permissions = [...role.permissions];
  
  // Add inherited permissions
  for (const inheritedRole of role.inherits) {
    permissions = [...permissions, ...getAllPermissions(inheritedRole)];
  }
  
  // Remove duplicates
  return [...new Set(permissions)];
}

/**
 * Check if a user has a specific permission
 * @param {Object} user - The user object
 * @param {string} permission - The permission to check
 * @returns {boolean} Whether the user has the permission
 */
function hasPermission(user, permission) {
  if (!user || !user.roles) {
    return false;
  }
  
  // Get all permissions for the user's roles
  const userPermissions = user.roles.reduce((acc, role) => {
    return [...acc, ...getAllPermissions(role)];
  }, []);
  
  // Remove duplicates
  const uniquePermissions = [...new Set(userPermissions)];
  
  return uniquePermissions.includes(permission);
}

/**
 * Middleware to check if a user has the required permission
 * @param {string} permission - The required permission
 * @returns {Function} Middleware function
 */
function requirePermission(permission) {
  return (root, args, context, info) => {
    const { user } = context;
    
    if (!user) {
      throw new AuthenticationError('You must be logged in');
    }
    
    if (!hasPermission(user, permission)) {
      throw new ForbiddenError(`You don't have permission: ${permission}`);
    }
    
    return true;
  };
}

/**
 * Middleware to check if a user has any of the required permissions
 * @param {Array<string>} permissions - The required permissions
 * @returns {Function} Middleware function
 */
function requireAnyPermission(permissions) {
  return (root, args, context, info) => {
    const { user } = context;
    
    if (!user) {
      throw new AuthenticationError('You must be logged in');
    }
    
    for (const permission of permissions) {
      if (hasPermission(user, permission)) {
        return true;
      }
    }
    
    throw new ForbiddenError(`You don't have any of the required permissions: ${permissions.join(', ')}`);
  };
}

/**
 * Middleware to check if a user has all of the required permissions
 * @param {Array<string>} permissions - The required permissions
 * @returns {Function} Middleware function
 */
function requireAllPermissions(permissions) {
  return (root, args, context, info) => {
    const { user } = context;
    
    if (!user) {
      throw new AuthenticationError('You must be logged in');
    }
    
    for (const permission of permissions) {
      if (!hasPermission(user, permission)) {
        throw new ForbiddenError(`You don't have the required permission: ${permission}`);
      }
    }
    
    return true;
  };
}

/**
 * Middleware to check if a user is the owner of a resource
 * @param {Function} getResourceOwnerId - Function to get the resource owner ID
 * @param {string} ownerPermission - Permission required if not the owner
 * @returns {Function} Middleware function
 */
function requireOwnerOrPermission(getResourceOwnerId, ownerPermission) {
  return async (root, args, context, info) => {
    const { user } = context;
    
    if (!user) {
      throw new AuthenticationError('You must be logged in');
    }
    
    const ownerId = await getResourceOwnerId(root, args, context, info);
    
    if (user.id === ownerId) {
      return true;
    }
    
    if (!hasPermission(user, ownerPermission)) {
      throw new ForbiddenError(`You don't have permission: ${ownerPermission}`);
    }
    
    return true;
  };
}

module.exports = {
  roles,
  hasPermission,
  requirePermission,
  requireAnyPermission,
  requireAllPermissions,
  requireOwnerOrPermission
};
