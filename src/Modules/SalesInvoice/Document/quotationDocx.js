/**
 * THE REQUEST FOR QUOTATION, AS A WORD FILE - one per vendor, as the earlier
 * screens downloaded it ("<vendor>_Request_Quotation.docx"):
 *
 *   downloadQuotationDocx(part)   part = one vendor's entry of the request -
 *                                 { seller, buyer, product, so_no, so_date }
 *                                 (procurement.js buildQuotationDocument):
 *                                 the seller the vendor, the buyer the company
 *                                 asking ({ name, address, gstin, phone, email })
 *
 * THE SAME FILE AS BEFORE, ON PURPOSE. The vendor fills it in (rate, MOQ,
 * discount, terms) and it comes back to the server, which reads it as a Word
 * file and finds what was filled in by these very labels and tables
 * ("Seller", "Buyer", "Specification:", "Inclusions", "Authorised
 * Signature/Date" ...). So the sheet below is the earlier template, word for
 * word - only every value is escaped now.
 *
 * HOW IT IS PACKED. As html-docx-js packed it: a .docx whose body is one
 * HTML part (an "altChunk", carried as MHT) that Word turns into a document
 * when it opens it. The .docx is a zip; it is written here uncompressed
 * (stored - as that library's zip did), so no library is needed.
 */

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const productRow = (item, index) => {
  const specification = Object.entries(item?.sku_details && typeof item.sku_details === 'object' ? item.sku_details : {})
    .filter(([key, value]) => key !== 'Quantity' && value !== null && value !== '')
    .map(([key, value]) => `${escapeHtml(key)} :  ${escapeHtml(value)} <br/>`)
    .join('')
  return `
        <tr>
          <td style="line-height:1; width: 4%; border-bottom:1px solid black; text-align:center;">
            ${index + 1}
          </td>
          <td style="line-height:1; width: 28%; border-bottom:1px solid black; border-left:1px solid black;">
            ${escapeHtml(item.Description)}
            <p style="line-height:1; font-size:12px; margin:0; padding:0;">
             Specification: ${specification}
            </p>
          </td>
          <td style="line-height:1; width: 10%; border-bottom:1px solid black; border-left:1px solid black;">
            ${escapeHtml(item.Hsn_code)}
          </td>
          <td style="line-height:1; width: 8%; border-bottom:1px solid black; border-left:1px solid black;">
            ${escapeHtml(item.Per)}
          </td>
          <td style="line-height:1; width: 8%; border-bottom:1px solid black; border-left:1px solid black; text-align: right;">
            ${escapeHtml(item.Qty)}
          </td>
          <td style="line-height:1; width: 8%; border-bottom:1px solid black; border-left:1px solid black; text-align: right;"></td>
          <td style="line-height:1; width: 10%; border-bottom:1px solid black; border-left:1px solid black; text-align: right;"></td>
          <td style="line-height:1; width: 8%; border-bottom:1px solid black; border-left:1px solid black; text-align: right;"></td>
          <td style="line-height:1; width: 8%; border-bottom:1px solid black; border-left:1px solid black; text-align: right;">
              ${escapeHtml(item.Gst_rate)}
          </td>
          <td style="line-height:1; width: 10%; border-bottom:1px solid black; border-left:1px solid black; text-align: right;"></td>
        </tr>
      `
}

/** The sheet - the earlier "Request for Quotation" template. */
export const quotationHtml = ({ seller = {}, buyer = {}, product = [], so_no: soNo, so_date: soDate }) => `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Request Quotation</title>
      </head>

      <body>
      <h1 style="text-align: center;">Request for Quotation </h1>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 auto 0 auto;">
          <tr>
            <!-- SELLER SECTION -->
            <td
              style="vertical-align: top; width: 60%; border-top: 1px solid black; border-left: 1px solid black;">
              <strong> Seller: </strong>

              <p style="margin: 2px 0 0 2px; padding: 0; font-size: 12px;">
                <strong>${escapeHtml(seller.name)}</strong><br/>
                ${escapeHtml(seller.address)}<br/>
                GSTIN: ${escapeHtml(seller.gstin)}<br/>
                Phone: ${escapeHtml(seller.contact)} &nbsp;Email: ${escapeHtml(seller.email)}
              </p>
            </td>
            <td style="width: 40%;">
              <table style="width: 100%;" cellpadding="0" cellspacing="0">
                <tr>
                  <td
                    style="width: 50%;  vertical-align: top; font-size: 12px; height: 60px; border-top: 1px solid black; border-left: 1px solid black; border-right: 1px solid black;">
                    Quotation No.: <br/>
                    </td>
                  <td
                    style="width: 50%;  vertical-align: top; font-size: 12px; height: 60px; border-top: 1px solid black; border-right: 1px solid black;">
                    Quotation Date: <br/>
                  </td>
                </tr>
                <tr>
                  <td
                    style="width: 50%;  vertical-align: top; font-size: 12px; height: 60px; border-right: 1px solid black; border-top: 1px solid black; border-left: 1px solid black;">
                    Reference No.: <strong>${escapeHtml(soNo)} </strong></td>
                  <td
                    style=" width: 50%;  vertical-align: top; font-size: 12px; height: 60px; border-top: 1px solid black; border-right: 1px solid black;">
                    Reference Date: <strong>${escapeHtml(soDate)} </strong>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- BUYER SECTION -->
          <tr>
            <td
              style="vertical-align: top; width: 60%; border-top: 1px solid black; border-left: 1px solid black;">
              <strong>Buyer: </strong>
              <p style="margin: 2px 0 0 2px; padding: 0; font-size: 12px;">
                <strong>${escapeHtml(buyer.name)}</strong><br/>
                ${escapeHtml(buyer.address)}<br/>
                GSTIN: ${escapeHtml(buyer.gstin)}<br/>
                Phone: ${escapeHtml(buyer.phone)}&nbsp;Email: ${escapeHtml(buyer.email)}
              </p>
            </td>
            <td style="width: 40%;">
              <table style="width: 100%;" cellpadding="0" cellspacing="0">
                <tr>
                  <td
                    style="width: 50%; vertical-align: top; font-size: 12px; height: 60px; border-right: 1px solid black; border-top: 1px solid black; border-left: 1px solid black;">
                    Validity Period: </td>
                  <td
                    style="width: 50%;  vertical-align: top; font-size: 12px; height: 60px; border-top: 1px solid black; border-right: 1px solid black;">
                    Delivery Time: </td>
                </tr>
                <tr>
                  <td
                    style=" width: 50%;  vertical-align: top; font-size: 12px; height: 60px; border-right: 1px solid black; border-top: 1px solid black; border-left: 1px solid black;">
                    Advanced % Required: </td>
                  <td
                    style=" width: 50%;  vertical-align: top; font-size: 12px; height: 60px; border-top: 1px solid black; border-right: 1px solid black;">
                    Credit Terms: </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td colspan="2" style="border-left: 1px solid black; border-right: 1px solid black;">
              <div style="min-height: 400px;  margin: 0; padding: 0;">
                <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0; padding: 0;">
                  <thead>
                    <tr>
                      <th
                        style="height: 30px; width: 4%; border-bottom:1px solid black; border-top:1px solid black; ">
                        Sr</th>
                      <th
                        style="height: 30px; width: 28%; border-bottom:1px solid black; border-top:1px solid black; border-left:1px solid black">
                        Description of Goods</th>
                      <th
                        style="height: 30px; width: 10%; border-bottom:1px solid black; border-top:1px solid black; border-left:1px solid black">
                        HSN</th>
                      <th
                        style="height: 30px; width: 8%; border-bottom:1px solid black; border-top:1px solid black; border-left:1px solid black">
                        Per</th>
                      <th
                        style="height: 30px; width: 8%; border-bottom:1px solid black; border-top:1px solid black; border-left:1px solid black">
                        Qty</th>
                      <th
                        style="height: 30px; width: 8%; border-bottom:1px solid black; border-top:1px solid black; border-left:1px solid black">
                        MOQ</th>
                      <th
                        style="height: 30px; width: 10%; border-bottom:1px solid black; border-top:1px solid black; border-left:1px solid black">
                        Unit Rate</th>
                      <th
                        style="height: 30px; width: 8%; border-bottom:1px solid black; border-top:1px solid black; border-left:1px solid black">
                        Discount %</th>
                      <th
                        style="height: 30px; width: 8%; border-bottom:1px solid black; border-top:1px solid black; border-left:1px solid black">
                        GST %</th>
                      <th
                        style="height: 30px; width: 10%; border-bottom:1px solid black; border-top:1px solid black; border-left:1px solid black; ">
                        Total</th>
                    </tr>
                  </thead>

                  <tbody>
                    ${(Array.isArray(product) ? product : []).map(productRow).join('')}

                    <tr>
                      <td colspan="10" style="height: 60px;"></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </td>
          </tr>

          <tr>
            <td width="60%"
              style="vertical-align: top; border-top: 1px solid black; border-right: 1px solid black; border-left: 1px solid black;">
              <span>Additional Charges: </span>
              <ul>
                <li></li>
                <li></li>
                <li></li>
              </ul>
            </td>

            <td width="40%"
              style="vertical-align: top; border-top: 1px solid black; border-right: 1px solid black; ">
              <span>Amount: </span>
              <ul>
                <li></li>
                <li></li>
                <li></li>
              </ul>
            </td>
          </tr>

          <tr>
            <td width="60%"
              style="vertical-align: top; height: 100px; margin: 0; padding: 0; border-top: 1px solid black; border-right: 1px solid black; border-left: 1px solid black; ">
              <span>Warranty Duration:</span><br /><br />
              <hr />
              <span>Coverage Details:</span><br>
            </td>

            <td width="40%"
              style="vertical-align: top; margin: 0; padding: 0; border-top: 1px solid black; border-right: 1px solid black;">
              <strong>Bank Details</strong><br>
              Bank Name: <br>
              A/C No.: <br>
              IFSC: <br>
              Branch:
            </td>
          </tr>

          <tr>
            <td colspan="2" style="border: none;">
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0; padding: 0;">
                <tr>
                  <td width="50%"
                    style="vertical-align: top; margin: 0; padding: 0; border-top: 1px solid black;  border-right: 1px solid black; border-left: 1px solid black; ">
                    <span>Inclusions:</span>
                    <ul>
                      <li></li>
                      <li></li>
                      <li></li>
                    </ul>
                  </td>

                  <td width="50%"
                    style="vertical-align: top; margin: 0; padding: 0;  border-top: 1px solid black; border-right: 1px solid black;">
                    <span>Exclusions:</span>
                    <ul>
                      <li></li>
                      <li></li>
                      <li></li>
                    </ul>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td colspan="2"
              style="vertical-align: top; height: 50px; border-right: 1px solid black; border-left: 1px solid black; border-top: 1px solid black;">
              <span>Note:</span>&nbsp;
            </td>
          </tr>

          <tr>
            <td width="60%"
              style="vertical-align: top; margin: 0; padding: 0; height: 80px; border-right: 1px solid black; border-top: 1px solid black; border-left: 1px solid black; border-bottom: 1px solid black;">
              <span>Declaration:</span><br>
              &nbsp;
            </td>

            <td width="40%"
              style="vertical-align: bottom; text-align: right; margin: 0; padding: 0; border-top: 1px solid black; border-right: 1px solid black; border-bottom: 1px solid black;">
              Authorised Signature/Date
            </td>
          </tr>

        </table>
      </body>
      </html>
    `

/* ------------------------------------------------------------------ */
/* The .docx package - as html-docx-js wrote it                       */
/* ------------------------------------------------------------------ */

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType=
    "application/vnd.openxmlformats-package.relationships+xml" />
  <Override PartName="/word/document.xml" ContentType=
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/afchunk.mht" ContentType="message/rfc822"/>
</Types>
`
const PACKAGE_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship
      Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
      Target="/word/document.xml" Id="R09c83fafc067488e" />
</Relationships>
`
const DOCUMENT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/aFChunk"
    Target="/word/afchunk.mht" Id="htmlChunk" />
</Relationships>
`
// Letter, portrait, one-inch margins - the library's defaults, which the earlier download used.
const DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:altChunk r:id="htmlChunk" />
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840" w:orient="portrait" />
      <w:pgMar w:top="1440"
               w:right="1440"
               w:bottom="1440"
               w:left="1440"
               w:header="720"
               w:footer="720"
               w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>
`

/** The HTML as the MHT part Word reads - quoted-printable, so every "=" is "=3D"; anything past ASCII as an HTML entity. */
const mhtOf = (html) => `MIME-Version: 1.0
Content-Type: multipart/related;
    type="text/html";
    boundary="----=mhtDocumentPart"


------=mhtDocumentPart
Content-Type: text/html;
    charset="utf-8"
Content-Transfer-Encoding: quoted-printable
Content-Location: file:///C:/fake/document.html

${html.replace(/[\u0080-\u{10ffff}]/gu, (char) => `&#${char.codePointAt(0)};`).replace(/=/g, '=3D')}



------=mhtDocumentPart--
`

/* ---- a stored (uncompressed) zip ---- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()
const crc32 = (bytes) => {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** A zip of the files given ([name, text]), each stored as it is. */
export const storedZip = (files) => {
  const encoder = new TextEncoder()
  const entries = files.map(([name, text]) => {
    const nameBytes = encoder.encode(name)
    const data = encoder.encode(text)
    return { nameBytes, data, crc: crc32(data) }
  })
  const localSize = entries.reduce((total, entry) => total + 30 + entry.nameBytes.length + entry.data.length, 0)
  const centralSize = entries.reduce((total, entry) => total + 46 + entry.nameBytes.length, 0)
  const bytes = new Uint8Array(localSize + centralSize + 22)
  const view = new DataView(bytes.buffer)
  // 1 Jan 2000, 00:00 - a fixed date, so the same request makes the same file.
  const DOS_DATE = ((2000 - 1980) << 9) | (1 << 5) | 1
  let at = 0
  const offsets = []
  entries.forEach((entry) => {
    offsets.push(at)
    view.setUint32(at, 0x04034b50, true)
    view.setUint16(at + 4, 10, true)
    view.setUint16(at + 6, 0x0800, true) // UTF-8 names
    view.setUint16(at + 8, 0, true) // stored
    view.setUint16(at + 10, 0, true)
    view.setUint16(at + 12, DOS_DATE, true)
    view.setUint32(at + 14, entry.crc, true)
    view.setUint32(at + 18, entry.data.length, true)
    view.setUint32(at + 22, entry.data.length, true)
    view.setUint16(at + 26, entry.nameBytes.length, true)
    view.setUint16(at + 28, 0, true)
    bytes.set(entry.nameBytes, at + 30)
    bytes.set(entry.data, at + 30 + entry.nameBytes.length)
    at += 30 + entry.nameBytes.length + entry.data.length
  })
  const centralAt = at
  entries.forEach((entry, index) => {
    view.setUint32(at, 0x02014b50, true)
    view.setUint16(at + 4, 20, true)
    view.setUint16(at + 6, 10, true)
    view.setUint16(at + 8, 0x0800, true)
    view.setUint16(at + 10, 0, true)
    view.setUint16(at + 12, 0, true)
    view.setUint16(at + 14, DOS_DATE, true)
    view.setUint32(at + 16, entry.crc, true)
    view.setUint32(at + 20, entry.data.length, true)
    view.setUint32(at + 24, entry.data.length, true)
    view.setUint16(at + 28, entry.nameBytes.length, true)
    view.setUint16(at + 30, 0, true)
    view.setUint16(at + 32, 0, true)
    view.setUint16(at + 34, 0, true)
    view.setUint16(at + 36, 0, true)
    view.setUint32(at + 38, 0, true)
    view.setUint32(at + 42, offsets[index], true)
    bytes.set(entry.nameBytes, at + 46)
    at += 46 + entry.nameBytes.length
  })
  view.setUint32(at, 0x06054b50, true)
  view.setUint16(at + 8, entries.length, true)
  view.setUint16(at + 10, entries.length, true)
  view.setUint32(at + 12, at - centralAt, true)
  view.setUint32(at + 16, centralAt, true)
  return bytes
}

export const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** One vendor's request as .docx bytes. */
export const quotationDocx = (part) =>
  storedZip([
    ['[Content_Types].xml', CONTENT_TYPES],
    ['_rels/.rels', PACKAGE_RELS],
    ['word/document.xml', DOCUMENT_XML],
    ['word/afchunk.mht', mhtOf(quotationHtml(part))],
    ['word/_rels/document.xml.rels', DOCUMENT_RELS],
  ])

/** The file's name, as before: "<vendor>_Request_Quotation.docx" - with what a file name cannot hold taken out. */
export const quotationFileName = (part) => `${String(part?.seller?.name ?? 'Vendor').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Vendor'}_Request_Quotation.docx`

/** Saves one vendor's request to the user's disk. */
export function downloadQuotationDocx(part) {
  const url = URL.createObjectURL(new Blob([quotationDocx(part)], { type: DOCX_TYPE }))
  const link = document.createElement('a')
  link.href = url
  link.download = quotationFileName(part)
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Long enough for the browser to start the download, then the URL is released.
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
