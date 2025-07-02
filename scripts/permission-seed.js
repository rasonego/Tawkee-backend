import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const createPermissionsAndRoles = async () => {
  // Create the permissions
  const permissions = [
    { 
        action: 'VIEW_INTERACTIONS',
        resource: 'DASHBOARD',
        description: 'Allows viewing interactions in the dashboard.'
    },
    { 
        action: 'VIEW_CREDIT_USAGE',
        resource: 'DASHBOARD',
        description: 'Allows viewing credit usage in the dashboard.'
    },
    { 
        action: 'VIEW_CREDIT_REMAINING',
        resource: 'DASHBOARD',
        description: 'Allows viewing the remaining credit balance in the dashboard.'
    },
    
    { 
        action: 'VIEW_AS_ADMIN',
        resource: 'PLAN',
        description: 'Allows viewing existing Tawkee plans on Stripe.'
    },
    { 
        action: 'CREATE_AS_ADMIN',
        resource: 'PLAN',
        description: 'Allows creating a new Tawkee plan on Stripe.'
    },
    { 
        action: 'EDIT_AS_ADMIN',
        resource: 'PLAN',
        description: 'Allows editing a Tawkee plan on Stripe.'
    },
    { 
        action: 'VIEW_AS_ADMIN',
        resource: 'WORKSPACE',
        description: 'Allows viewing existing workspaces on the platform.'
    },
    { 
        action: 'EDIT',
        resource: 'WORKSPACE',
        description: 'Allows editing the workspace\'s information.'
    },
    { 
        action: 'EDIT_AS_ADMIN',
        resource: 'WORKSPACE',
        description: 'Allows editing any workspace\'s information.'
    },
    { 
        action: 'MANAGE_STATUS_AS_ADMIN',
        resource: 'WORKSPACE',
        description: 'Allows activating or deactivating any workspace.'
    },
    { 
        action: 'CREATE_USER_PERMISSION_AS_ADMIN',
        resource: 'WORKSPACE',
        description: 'Allows creating user permissions in any workspace.'
    },
    { 
        action: 'EDIT_USER_PERMISSION_AS_ADMIN',
        resource: 'WORKSPACE',
        description: 'Allows editing user permissions in any workspace.'
    },
    { 
        action: 'DELETE_USER_PERMISSION_AS_ADMIN',
        resource: 'WORKSPACE',
        description: 'Allows deleting user permissions in any workspace.'
    },
    { 
        action: 'OVERRIDE_SUBSCRIPTION_LIMITS_AS_ADMIN',
        resource: 'WORKSPACE',
        description: 'Allows overriding plan\'s limits of any workspace subscription.'
    },
    { 
        action: 'VIEW',
        resource: 'AGENT',
        description: 'Allows viewing agents in the workspace.'
    },
    { 
        action: 'VIEW_AS_ADMIN',
        resource: 'AGENT',
        description: 'Allows viewing agents from any workspace.'
    },
    { 
        action: 'CREATE',
        resource: 'AGENT',
        description: 'Allows creating an agent in the workspace.'
    },
    { 
        action: 'CREATE_AS_ADMIN',
        resource: 'AGENT',
        description: 'Allows creating an agent in any workspace.'
    },
    { 
        action: 'EDIT_PROFILE',
        resource: 'AGENT',
        description: 'Allows editing an agent\'s profile in the workspace.'
    },
    { 
        action: 'EDIT_PROFILE_AS_ADMIN',
        resource: 'AGENT',
        description: 'Allows editing an agent\'s profile in any workspace.'
    },
    { 
        action: 'EDIT_WORK',
        resource: 'AGENT',
        description: 'Allows editing an agent\'s work in the workspace.'
    },
    { 
        action: 'EDIT_WORK_AS_ADMIN',
        resource: 'AGENT',
        description: 'Allows editing an agent\'s work in any workspace.'
    },
    { 
        action: 'TRAINING_CREATE',
        resource: 'AGENT',
        description: 'Allows creating training for an agent in the workspace.'
    },
    { 
        action: 'TRAINING_CREATE_AS_ADMIN',
        resource: 'AGENT',
        description: 'Allows creating training for an agent in any workspace.'
    },
    { 
        action: 'TRAINING_DELETE',
        resource: 'AGENT',
        description: 'Allows deleting training from an agent in the workspace.'
    },
    { 
        action: 'TRAINING_DELETE_AS_ADMIN',
        resource: 'AGENT',
        description: 'Allows deleting training from an agent in any workspace.'
    },
    { 
        action: 'INTEGRATIONS_ACTIVATE_AS_CLIENT',
        resource: 'AGENT',
        description: 'Allows activating agent integrations in the workspace as a client.'
    },
    { 
        action: 'MANAGE_SETTINGS',
        resource: 'AGENT',
        description: 'Allows managing agent settings in the workspace.'
    },
    { 
        action: 'MANAGE_SETTINGS_AS_ADMIN',
        resource: 'AGENT',
        description: 'Allows managing agent settings in any workspace.'
    },
    { 
        action: 'DELETE',
        resource: 'AGENT',
        description: 'Allows deleting an agent in the workspace.'
    },
    { 
        action: 'DELETE_AS_ADMIN',
        resource: 'AGENT',
        description: 'Allows deleting an agent in any workspace.'
    },
    { 
        action: 'DELETE_PERMANENTLY_AS_ADMIN',
        resource: 'AGENT',
        description: 'Allows permanently deleting an agent from any workspace.'
    },

    { 
        action: 'VIEW_LIST',
        resource: 'CHAT',
        description: 'Allows viewing the chat list in the workspace.'
    },
    { 
        action: 'VIEW_LIST_AS_ADMIN',
        resource: 'CHAT',
        description: 'Allows viewing the chat list in any workspace.'
    },
    { 
        action: 'VIEW_MESSAGES',
        resource: 'CHAT',
        description: 'Allows viewing messages in a chat in the workspace.'
    },
    { 
        action: 'VIEW_MESSAGES_AS_ADMIN',
        resource: 'CHAT',
        description: 'Allows viewing messages in any chat in the workspace.'
    },
    { 
        action: 'ATTEND',
        resource: 'CHAT',
        description: 'Allows attending to a chat in the workspace.'
    },
    { 
        action: 'ATTEND_AS_ADMIN',
        resource: 'CHAT',
        description: 'Allows attending to any chat in the workspace.'
    },
    { 
        action: 'MANAGE_STATUS',
        resource: 'CHAT',
        description: 'Allows managing a chat\'s status in the workspace.'
    },
    { 
        action: 'MANAGE_STATUS_AS_ADMIN',
        resource: 'CHAT',
        description: 'Allows managing any chat\'s status in the workspace.'
    },
    { 
        action: 'DELETE',
        resource: 'CHAT',
        description: 'Allows deleting a chat in the workspace.'
    },
    { 
        action: 'DELETE_AS_ADMIN',
        resource: 'CHAT',
        description: 'Allows deleting any chat in the workspace.'
    },
    { 
        action: 'DELETE_PERMANENTLY_AS_ADMIN',
        resource: 'CHAT',
        description: 'Allows permanently deleting any chat in the workspace.'
    },

    { 
        action: 'VIEW',
        resource: 'BILLING',
        description: 'Allows viewing the workspace billing.'
    },
    { 
        action: 'VIEW_AS_ADMIN',
        resource: 'BILLING',
        description: 'Allows viewing the workspace billing.'
    },
    { 
        action: 'MANAGE_SUBSCRIPTION',
        resource: 'BILLING',
        description: 'Allows managing the subscription of the workspace on Stripe.'
    },
    { 
        action: 'MANAGE_SUBSCRIPTION_AS_ADMIN',
        resource: 'BILLING',
        description: 'Allows managing the subscription of any workspace on Stripe.'
    },
    { 
        action: 'PURCHASE_EXTRA_CREDITS',
        resource: 'BILLING',
        description: 'Allows purchasing extra credits for the workspace on Stripe.'
    },
    { 
        action: 'PURCHASE_EXTRA_CREDITS_AS_ADMIN',
        resource: 'BILLING',
        description: 'Allows purchasing extra credits for any workspace on Stripe.'
    },
    { 
        action: 'MANAGE_SMART_RECHARGE_SETTINGS',
        resource: 'BILLING',
        description: 'Allows managing the credit recharge settings for the workspace.'
    },
    { 
        action: 'MANAGE_SMART_RECHARGE_SETTINGS_AS_ADMIN',
        resource: 'BILLING',
        description: 'Allows managing the credit recharge settings for any workspace.'
    },

    { 
        action: 'VIEW_PROFILE',
        resource: 'USER',
        description: 'Allows viewing a user\'s profile in the workspace.'
    },
    { 
        action: 'VIEW_PROFILE_AS_ADMIN',
        resource: 'USER',
        description: 'Allows viewing a user\'s profile in the workspace.'
    },
    { 
        action: 'EDIT_PROFILE',
        resource: 'USER',
        description: 'Allows editing a user\'s profile in the workspace.'
    },
    { 
        action: 'EDIT_PROFILE_AS_ADMIN',
        resource: 'USER',
        description: 'Allows editing a user\'s profile in the workspace.'
    },
    { 
        action: 'DELETE_PROFILE',
        resource: 'USER',
        description: 'Allows deleting a user\'s profile in the workspace.'
    },
    { 
        action: 'DELETE_PROFILE_AS_ADMIN',
        resource: 'USER',
        description: 'Allows deleting a user\'s profile in the workspace.'
    },
    { 
        action: 'DELETE_PROFILE_PERMANENTLY_AS_ADMIN',
        resource: 'USER',
        description: 'Allows permanently deleting a user\'s profile in the workspace.'
    }
  ];

  // Create permissions in the database
  for (const permission of permissions) {
    await prisma.permission.upsert({
      where: {
        action_resource: {
          action: permission.action,
          resource: permission.resource,
        },
      },
      update: {},
      create: {
        action: permission.action,
        resource: permission.resource,
        description: permission.description,
      },
    });
  }

  // Create ADMIN and CLIENT roles
  const roles = [
    { name: 'ADMIN', description: 'System administrator with full permissions'

    },
    { name: 'CLIENT', description: 'Client with limited permissions to their own workspace'

    },
  ];

  // Insert roles
  for (const role of roles) {
    try {
        await prisma.role.create({
          data: role,
        });
    } catch (error) {
        console.log(error.message);
    }
  }

  // Associating permissions with roles (ADMIN and CLIENT)
  const adminRole = await prisma.role.findUnique({ where: { name: 'ADMIN' } });
  const clientRole = await prisma.role.findUnique({ where: { name: 'CLIENT' } });

  if (adminRole && clientRole) {
    const adminPermissions = await prisma.permission.findMany({});
    
    // Assigning permissions to ADMIN
    for (const permission of adminPermissions) {
      if (permission.action.endsWith('_AS_ADMIN') || !permission.action.endsWith('_AS_CLIENT')) {
        await prisma.rolePermission.create({
          data: {
            roleId: adminRole.id,
            permissionId: permission.id,
          },
        });
      }
    }

    // Assigning permissions to CLIENT (excluding _AS_ADMIN permissions)
    const clientPermissions = adminPermissions.filter(
      (perm) => !perm.action.endsWith('_AS_ADMIN') && !perm.action.endsWith('_AS_CLIENT')
    );
    for (const permission of clientPermissions) {
      await prisma.rolePermission.create({
        data: {
          roleId: clientRole.id,
          permissionId: permission.id,
        },
      });
    }
  }

  console.log('Permissions and roles successfully created!');
};

createPermissionsAndRoles()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
