/*
 * Author    : Francesco
 * Created at: 2023-03-16 20:30
 * Edited by : Francesco
 * Edited at : 2023-04-25 16:26
 *
 * Copyright (c) 2023 Xevolab S.R.L.
 */

const permRegex = /^(\+|-)?(([A-Za-z0-9]+)|(\*))+@[a-zA-Z0-9]+(((:[a-zA-Z0-9-_]*)*(:[a-zA-Z0-9-_]+)$)|$)/;

/**
 * The parsePermissions function takes the permission blocks, which are
 * lists of permissions strings, and converts them into a tree-like
 * structure that can be used to check whether a user has a certain
 * permission.
 * @param  {[[string]]} permBlocks  A list of lists of permissions strings
 *                                  granted to the user sorted from the
 *                                  least important to the most important.
 * @return {object}                 An object containing the permissions
 *                                  in a tree-like structure.
 */
export const parsePermissions = (permBlocks = []) => {

	let apps = {};

	function processPerms(perms, overwrite = false) {

		// This array keeps track of the permissions that have been overridden
		// by this loop and are now in a `++` or `--` state, which need to be
		// converted back to a single `+` or `-`
		let permsToFinalize = [];

		for (let p of perms) {

			/*
			  Permissions follow the structure:

								[action]<permission>@<target>
			  action     = +|-
			  permission = the permission to be assigned
			  target     = <app>*[:resource]
			 */

			// Validating the permission string against the pattern
			if (!permRegex.test(p)) continue;

			// The action character can be omitted, implying a +
			let permAct = p.slice(0, 1) !== "-" ? "+" : "-";

			let perm = p.split("@")[0]
			if (p.slice(0, 1) === "+" || p.slice(0, 1) === "-") perm = perm.slice(1);

			// The permission string is split into its components
			let split = p.split("@")[1].split(":");

			// Separating the app and resource portion of the string
			let app = split[0];
			let resource = split.slice(1).join(":");

			// Update the app object by adding the different permissions
			// in a tree
			if (apps[app]) {
				// If the app exists, but not the resource, create that and move on
				if (!apps[app][resource]) {
					apps[app][resource] = { [perm]: permAct + (overwrite ? permAct : "") };
					if (overwrite) permsToFinalize.push([app, resource, perm]);
					continue;
				}
				// If the app:resource combo exists already, check whether the
				// previous permission is `+` or `-`. In the event of two
				// opposite permissions, the most permissive one wins (aka +).
				//
				// This is only true when overwrite is false, otherwise it means
				// the permissions that are being processed now have "priority"
				// over the previous. When this is the case, modifications are
				// marked as a double `++`/`--` so that it's possibile to keep the
				// rule that between two opposite permissions, the most permissive
				// one is picked, otherwise there would be no way to tell if the
				// value was already modified or this is the first edit we are making
				if (apps[app][resource] && apps[app][resource][perm]) {
					// To ignore this edit, the value needs to be already permissive
					if (apps[app][resource][perm] === "+" && !overwrite) continue;
					if (apps[app][resource][perm] === "++") continue;

					// Otherwise update the existing value to give it a positive value
					apps[app][resource][perm] = permAct + (overwrite ? permAct : "");
					if (overwrite) permsToFinalize.push([app, resource, perm])
					continue;
				}

				// If the permission is still not applied at this point, it must be a new one
				if (!apps[app][resource][perm]) apps[app][resource][perm] = permAct
			}
			else {
				apps[app] = {
					[resource]: { [perm]: permAct },
					...(resource !== "" ? { "": {} } : {})
				}
			}

		}

		// Finalize the permissions that have been overridden by removing the
		// extra `+` or `-` from the permission string
		for (let i of permsToFinalize) {
			apps[i[0]][i[1]][i[2]] = apps[i[0]][i[1]][i[2]].slice(0, 1);
		}

	}

	/*
	  Create the tree that describes the permissions assigned to the user by
	  going through every block of permissions and processing them.
	 */
	for (const i in permBlocks) processPerms(permBlocks[i], i > 0);

	return apps

}

/**
 * stringifyPermissions takes the tree-like permissions structure and
 * creates simpler strings that summerize the permissions of the user
 * following the grammar defined in the documentation.
 * In essence, it re-creates the original lines from the database after
 * they are processed taking inheritance and priority into account
 * @param  {object}    p          tree-like structure
 * @return {[string]}             permissions as array of strings
 */
export const stringifyPermissions = (p) => {
	let permissionStrings = [];

	// For each app
	for (let app of Object.keys(p)) {
		// There are multiple resources
		for (let res of Object.keys(p[app])) {
			// Each of which has permissions
			for (let perm of Object.keys(p[app][res])) {
				permissionStrings.push(p[app][res][perm] + perm + "@" + app + (res !== "" ? ":" + res : ""))
			}
		}
	}

	return permissionStrings;
}

/**
 * validatePermission checks that a passed permission string is valid when
 * checked against the
 * @param   {string}  perm  The permission in a string form
 * @return  {boolean}       Whether the permission string is valid
 */
export const validatePermission = (perm) => {
	return permRegex.test(perm);
}

/**
 * Authorize is used to decide whether a user is allowed to perform
 * an action that requires the `requested` permission, knowing that
 * he/she has the permissions defined in the `granted` object.
 * The `requested` should be the most accurate representation of the action
 * that is being performed.
 * @param  {object} granted      The permission object that rapresents
 *                               what the user is allowed to do
 * @param  {string} requested    The permissions required to perform
 *                               the action
 * @param  {boolean} simpleMode  Whether to return a simple boolean or
 * 									   a more detailed object
 * @return {object}
 */
export const authorize = (granted, requested, simpleMode = true) => {

	function result(e) {
		// console.log("Auth result debug: ", e);
		if (simpleMode) return (typeof e.authorized === "boolean") ? e.authorized : false;

		return {
			ok: true,
			authorized: true,
			...e
		}
	}

	// Validating the requested permissions
	if (!permRegex.test(requested)) {
		return result({ ok: false, authorized: false, error: "Invalid requested permission" })
	}

	/* Splitting the permission in its components */

	// The action character can be omitted, implying a +
	let perm = requested.split("@")[0]
	if (requested.slice(0, 1) === "+" || requested.slice(0, 1) === "-") perm = perm.slice(1);

	// The permission string is split into its components
	let split = requested.split("@")[1].split(":");
	let app = split[0];

	/* Checking if the requested permission is granted to the user */

	// Making sure the app itself is present
	if (!granted[app])
		return result({ authorized: false, message: "The user does not have access to the '" + app + "' app" })

	// Then going through every component of the resource one by one in
	// reverse to check if the permission in grated at a more general
	// level.
	// More specific permissions have priority over general ones.
	// A request access@app:entity:entityID:subentity with granted
	// permissions: +access@app:entity, -access@app:entity:entityID will be
	// blocked as the negative permission is more specific.

	for (let i = split.length; i > 0; i--) {

		// console.log("--> " + split.slice(1, i).join(":"));
		// Each component of the resouce element can be omitted to allow for
		// whatever value to be placed there.
		// E.g.  permission@app::entity
		// This cycle will go through every possible placement of an empty
		// element and check if a permission on that resource is present.

		for (let j = i; j > 0; j--) {

			let resource = split.slice(1, i);

			// When the position to remove is the last element, slice the array
			// so that it doesn't have a trailing ':'
			if (j === resource.length) resource = resource.slice(0, resource.length - 1)
			// If the position is before the last, just leave "::"
			if (j < resource.length) resource[j - 1] = ""
			resource = resource.join(":");

			// console.log("    " + perm + "@" + app + ":" + resource);

			// Searching for this resource
			if (granted[app][resource]) {
				// If a match is found and the permission is present, this is the
				// result so that a specific '-' is more powerful than a generic '+'
				if (granted[app][resource][perm] === "-")
					return result({ authorized: false, message: `The permission -${perm}@${app}:${resource} blocks access` })
				if (granted[app][resource]["*"] === "-")
					return result({ authorized: false, message: `The permission -*@${app}:${resource} blocks access` })

				// If a '+' is specifically granted to this perm or a general '*',
				// authorize the request
				if (granted[app][resource][perm] === "+")
					return result({ authorized: true, message: `The permission +${perm}@${app}:${resource} grants access` })
				if (granted[app][resource]["*"] === "+")
					return result({ authorized: true, message: `The permission +*@${app}:${resource} grants access` })
			}
		}
	}

	/*// Last chance is to check for the '*' resource wildcard
	if (granted[app]["*"] && granted[app]["*"][perm] === "+")
	  return result({message: `The permission +${perm}@${app} is set to grant access`})
	if (granted[app]["*"] && granted[app]["*"]["*"] === "+")
	  return result({message: `The permission +*@${app} is set to grant access`})*/

	return result({ authorized: false, message: `No authorization was found for this resource` })

}
