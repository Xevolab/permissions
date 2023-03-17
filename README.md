# @xevolab/permissions

A Javascript **permissions parsing and evaluation library**.

It was created to easly handle permissions in a REST API where users may have needed complex permission sets, inherited from groups and roles, or directly assigned to them.

Each list of permissions is called a **permissions block**, and is an array containing one or more permissions as strings. This concepts will allow you to handle the order in which permissions are evaluated, and to easily manage permissions inheritance.

A concrete use case example could be a product managment system where users are granted access to each product based on their role and partecipation on the project.
Managers may have access to all products, based on a group/role permissions, but could get denied access to a specific product, based on a direct permission assignment.
_This example will be discussed further in the page._

# Installation

```bash
npm install @xevolab/permissions
```

# Basic concepts

## Permission structure

Each **permission** is a string as follows:

```text
[action]<permission>@<target>

action     = +|-
permission = the permission to be assigned
target     = <app>*[:resource]
```

Where:
- `action` is either `+` or `-` to indicate whether the permission is granted or revoked. If nothip is specified, the permission is granted;
- `permission` is a string rapresenting the permission to be assigned;
- `target` is a string rapresenting the target resrouce of the permission, which is made up of:
   - `app` is the name of the app, or a general identifier for the type of resource;
   - `resource` is a unique identifier the resource.

### Permission string examples

Positive permissions
- `+access@projects`: allows `access` on the `projects`
- `+access@projects:projectid`: allows `access` on the `projectid` resource of the `projects` app

Resource wildcards
- `+access@projects::documents`: allows `access` on the `documents` resource of any element the `projects` app

Permission wildcards
- `*@projects`: allows to perform any action on the `projects` app

## Granted permission tree

A user is granted a list of permissions, either directly or through groups/roles. This list is processed by the library into a **permissions tree**, which rapresents all the actions actions the user was granted or restricted on every resource.

Given these permissions:
```text
access@projects
-access@projects:projectid
+access@projects:projectid:prototype
+access@users
-*@users:userid1
```
The permission tree follows this structure:
```json
{
   "projects": {
      "": {
         "access": "+",
      },
      "projectid": {
         "access": "-"
      },
      "projectid:prototype": {
         "access": "+"
      }
   },
   "users": {
      "": {
         "access": "+"
      },
      "userid1": {
         "*": "-"
      }
   }
}
```

### Permissions specificity

When permissions are evaluated, the library will take into account the specificity of the permission requested against what the user was granted.

A more specific permission is the one with more elements in the target string.

The following resources are sorted from the most specific to the least specific:
```text
access@projects:projectid:prototype
-access@projects:projectid
access@projects
```

When evaluating permissions, the library will take the most specific permission into account when present, ignoring the less specific ones.

This means that, in the example above, the user will be granted access **only** to the `prototype` resource (and it's sub-resources) of the `projectid` project, while it will be able to access any other project.
```text
access@projects:projectid:prototype   -> Granted
access@projects:projectid:prototype:1 -> Granted
access@projects:projectid             -> Denied
access@projects:projectid:documents   -> Denied
access@projects:projectid2            -> Granted
access@projects:projectid2:prototype  -> Granted
access@projects:projectid2:documents  -> Granted
```

### Permission inheritance

When creating the permissions tree, the library will take into account the order in which the permissions blocks are passed.
Going back to the initial example, let's image that the user is a manager, hence it is granted access to every project:
```text
access@projects
+access@projects:projectid
```
But, for some reason, the user is denied access to a specific project:
```text
-access@projects:projectid:prototype
```

### Contradicting permissions

If a user is granted a permission, and then denied it on the same target, granted that the permissions are passed in the same block, the library will take the most permissive one into account.

```text
+access@projects:projectid
-access@projects:projectid
```
Will be equivalent to `+access@projects:projectid`

But
```text
+access@projects:projectid
-access@projects:projectid:prototype
-*@projects:projectid
```
Will not be modified, as the there are no permissions with exactly the same target.
In this case, any action on the `projectid` resource will be denied, except for `access`, which will be granted on everything except the `prototype` resource.

# How to use

The library exports 4 functions:
- `parsePermissions`: parses a list of permissions
blocks into a permission object;
- `stringifyPermissions`: parses a permission object into a permissions block;
- `validatePermission`: checks a permission string against a regex pattern;
- `authorize`: checks if a user is authorized to perform an action on a resource based on their permissions tree.

## `parsePermissions`

`parsePermissions(permissionsBlocks: string[][]): object`

The various permissions blocks are passed from the least to the most important, and are evaluated in order and will overwrite pre-existing permissions.

```javascript
const { parsePermissions } = require('@xevolab/permissions');

let permissionsTree = parsePermissions([
   [
      "access@projects",
      "-access@projects:projectid",
      "-*@users"
   ],
   [
      "+access@projects:projectid:prototype",
      "-access@projects:projectid:prototype",
   ],
   [
      "+*@users"
   ]
]);
/*
{
  "projects": {
    "": {
      "access": "+"
    },
    "projectid": {
      "access": "-"
    },
    "projectid:prototype": {
      "access": "+"
    }
  },
  "users": {
    "": {
      "*": "+"
    }
  }
}
*/
```

## `stringifyPermissions`

`stringifyPermissions(permission: object): string`

This function will return the smallest set of permissions that will generate the same permission tree from only one permissions block.

```javascript
const { stringifyPermissions } = require('@xevolab/permissions');

let stringPermissions = strinigyPermission(permissionTree);
/*
[
  '+access@projects',
  '-access@projects:projectid',
  '+access@projects:projectid:prototype',
  '+*@users'
]
*/
```

## `validatePermission`

`validatePermission(permission: string): boolean`

```javascript
const { validatePermission } = require('@xevolab/permissions');

let isValid = validatePermission('access@projects');
// true
```

## `authorize`

`authorize(grantedPermissions: object, requested: string, simpleMode: boolean): Object | boolean`

This function will check if a user is authorized to perform an action on a resource based on their permissions tree.
The `simpleMode` parameter is optional and will return a boolean if set to `true`, otherwise it will return an object with the following properties:
- `ok`: `true` if there wasn't any error;
- `authorized`: `true` if the user is authorized to perform the action, `false` otherwise;
- `message`: a message explaining why the user is authorized or not.

```javascript
const { authorize } = require('@xevolab/permissions');

authorize(permissionTree, 'access@projects:projectid:prototype:123:subresource');
// true

authorize(permissionTree, 'edit@projects:projectid:prototype:123:subresource');
// false

authorize(permissionTree, 'access@projects:projectid');
// false

authorize(permissionTree, 'access@projects:projectid2');
// true

authorize(permissionTree, 'access@users:userid');
// true

authorize(permissionTree, 'edit@users:userid');
// true

authorize(permissionTree, 'access@projects:projectid:prototype:123:subresource', false);
/*
{
  ok: true,
  authorized: true,
  message: 'The permission +access@projects:projectid:prototype grants access'
}
*/

authorize(permissionTree, 'access@projects:projectid', false);
/*
{
  ok: true,
  authorized: false,
  message: 'The permission -access@projects:projectid blocks access'
}
*/

```

### Using `authorize` in Express

```javascript
const { parsePermissions, authorize } = require('@xevolab/permissions');

app.use((req, res, next) => {
  if (req.user) {
    req.user.permissions = parsePermissions([
      req.user.permissions,
      req.user.groups.map(group => group.permissions)
    ]);

    res.user.authorize = (requested, simpleMode) => authorize(req.user.permissions, requested, simpleMode);
    // Or, using bind
    res.user.authorize = authorize.bind(null, req.user.permissions);

  }
  next();
});

app.get('/projects/:projectid/prototype/:prototypeid', (req, res, next) => {
  if (req.user && req.user.authorize(`access@projects:${req.params.projectid}:prototype:${req.params.prototypeid}`)) {
    // Do something
  } else {
    // Do something else
  }
});
```
