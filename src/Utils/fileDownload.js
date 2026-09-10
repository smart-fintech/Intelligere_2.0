/**
 * Downloads a file from an external or local URL.
 * Fetches as a Blob to prevent cross-origin issues and enforce custom file names.
 *
 * @param {string} fileUrl - Direct link to the file returned by the backend.
 * @param {string} defaultFileName - Fallback name if the URL does not contain one.
 */
export async function downloadFileFromUrl(fileUrl, defaultFileName = 'download.log') {
    if (!fileUrl) {
        throw new Error('No valid file URL provided.')
    }

    try {
        const response = await fetch(fileUrl)
        if (!response.ok) {
            throw new Error(`Failed to fetch file: ${response.statusText}`)
        }

        const blob = await response.blob()
        const blobUrl = window.URL.createObjectURL(blob)

        // Extract file name from URL if possible, otherwise use fallback
        const resolvedName =
            fileUrl.split('/').pop()?.split('?')[0] || defaultFileName

        const link = document.createElement('a')
        link.href = blobUrl
        link.setAttribute('download', resolvedName)
        document.body.appendChild(link)
        link.click()

        // Clean up memory
        link.remove()
        window.URL.revokeObjectURL(blobUrl)
    } catch {
        // Fallback direct link trigger if fetch gets blocked (e.g. strict CORS)
        const fallbackLink = document.createElement('a')
        fallbackLink.href = fileUrl
        fallbackLink.setAttribute('download', defaultFileName)
        fallbackLink.setAttribute('target', '_blank')
        fallbackLink.rel = 'noopener noreferrer'
        document.body.appendChild(fallbackLink)
        fallbackLink.click()
        fallbackLink.remove()
    }
}