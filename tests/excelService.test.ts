import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import {
  ExcelImportError,
  getImportedContactRows,
  parseSpreadsheetFile,
} from '../src/services/excelService'

function createSpreadsheetFile(
  fileName: string,
  rows: (string | number)[][],
): File {
  const extension = fileName.split('.').pop()

  if (extension === 'csv') {
    const worksheet = XLSX.utils.aoa_to_sheet(rows)
    return new File([XLSX.utils.sheet_to_csv(worksheet)], fileName, { type: 'text/csv' })
  }

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Contacts')
  const data = XLSX.write(workbook, {
    bookType: extension === 'xls' ? 'xls' : 'xlsx',
    type: 'array',
  })

  return new File([data], fileName)
}

describe('spreadsheet import', () => {
  it.each(['xlsx', 'xls', 'csv'] as const)(
    'imports %s files and preserves source row order',
    async (extension) => {
      const file = createSpreadsheetFile(`contacts.${extension}`, [
        ['Name', 'Contact Number', 'Notes'],
        ['Alice', '0771234567', 'first'],
        ['Bob', '0712345678', 'second'],
      ])

      const parsed = await parseSpreadsheetFile(file)

      expect(parsed.fileType).toBe(extension)
      expect(parsed.worksheetName).toBe(extension === 'csv' ? 'Sheet1' : 'Contacts')
      expect(parsed.nameColumn?.heading).toBe('Name')
      expect(parsed.phoneColumn?.heading).toBe('Contact Number')
      expect(getImportedContactRows(parsed)).toEqual([
        { sourceRowNumber: 2, name: 'Alice', phone: '0771234567' },
        { sourceRowNumber: 3, name: 'Bob', phone: '0712345678' },
      ])
    },
  )

  it('prefers the exact Name and Contact Number headings over aliases', async () => {
    const file = createSpreadsheetFile('contacts.xlsx', [
      ['Full Name', 'Phone Number', 'Name', 'Contact Number'],
      ['Alias Name', '0700000000', 'Exact Name', '0771234567'],
    ])

    const parsed = await parseSpreadsheetFile(file)

    expect(parsed.nameColumn?.index).toBe(2)
    expect(parsed.phoneColumn?.index).toBe(3)
    expect(getImportedContactRows(parsed)[0]).toMatchObject({
      name: 'Exact Name',
      phone: '0771234567',
    })
  })

  it('rejects unsupported and corrupted spreadsheet files', async () => {
    await expect(parseSpreadsheetFile(new File(['text'], 'contacts.txt')))
      .rejects.toMatchObject({ code: 'unsupported_file' })
    await expect(parseSpreadsheetFile(new File(['not an xlsx'], 'contacts.xlsx')))
      .rejects.toEqual(expect.any(ExcelImportError))
  })
})
