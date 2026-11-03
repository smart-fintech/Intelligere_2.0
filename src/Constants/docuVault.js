/**
 * The DocuVault module's fixed names.
 *
 *   DOCUVAULT_MODULE          its key in Constants/dashboardModules. In
 *                             `active_modules` it is "Repository" (see accessService)
 *   DOCUVAULT_SOCKET_MODULE   the `module` its WebSocket messages carry
 *   DOCUVAULT_UPDATED_ACTION  the `action` of the one it listens for
 *   STORAGE_FULL              the `storage_status` that stops uploads
 *   STORAGE_FULL_MESSAGE      what is said when an upload is stopped here,
 *                             before the backend has been asked
 */

export const DOCUVAULT_MODULE = 'DocuVault'

export const DOCUVAULT_SOCKET_MODULE = 'docuvault'
export const DOCUVAULT_UPDATED_ACTION = 'document_updated'

export const STORAGE_FULL = 'full'
export const STORAGE_FULL_MESSAGE = 'DocuVault storage is full. Delete some files to upload a new one.'
