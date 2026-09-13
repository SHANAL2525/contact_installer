import type {
  ExcelImportErrorCode,
  ImportedContactRow,
  ParsedSpreadsheet,
  SpreadsheetColumn,
  SpreadsheetFileType,
  SpreadsheetRow,
} from '../types/contact'

const supportedFileTypes = new Set<SpreadsheetFileType>(['xlsx', 'xls', 'csv'])

const nameHeadings = new Set([
  'name',
  'full name',
  'customer name',
  'contact name',
  'person name',
])

const phoneHeadings = new Set([
  'phone',
  'phone number',
  'mobile',
  'mobile number',
  'contact number',
  'telephone',
  'tel',
])

const errorMessages: Record<ExcelImportErrorCode, string> = {
  unsupported_file: 'Please choose an Excel or CSV file.',
  empty_file: 'This file is empty. Please choose a file containing contacts.',
  no_worksheets: 'This Excel file does not contain a worksheet.',
  missing_headings: 'No column headings were found in this file.',
  no_rows: 'No contact rows were found below the column headings.',
  corrupted_file: 'This file could not be read. It may be damaged or use an unsupported format.',
}

let currentImport: ParsedSpreadsheet | null = null

export class ExcelImportError extends Error {
  readonly code: ExcelImportErrorCode

  constructor(code: ExcelImportErrorCode) {
    super(errorMessages[code])
    this.name = 'ExcelImportError'
    this.code = code
  }
}

function normalizeHeading(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  return String(value).trim()
}

function getFileType(fileName: string): SpreadsheetFileType {
  const extension = fileName.split('.').pop()?.trim().toLowerCase()

  if (!extension || !supportedFileTypes.has(extension as SpreadsheetFileType)) {
    throw new ExcelImportError('unsupported_file')
  }

  return extension as SpreadsheetFileType
}

function detectColumn(
  columns: SpreadsheetColumn[],
  acceptedHeadings: Set<string>,
): SpreadsheetColumn | null {
  return columns.find((column) => acceptedHeadings.has(normalizeHeading(column.heading))) ?? null
}

function hasExpectedExcelSignature(data: ArrayBuffer, fileType: SpreadsheetFileType): boolean {
  if (fileType === 'csv') {
    return true
  }

  const bytes = new Uint8Array(data, 0, Math.min(data.byteLength, 8))

  if (fileType === 'xlsx') {
    return bytes[0] === 0x50 && bytes[1] === 0x4b
  }

  const compoundFileSignature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
  const isCompoundFile = compoundFileSignature.every((byte, index) => bytes[index] === byte)
  const isRawBiffFile = bytes[0] === 0x09 && [0x00, 0x02, 0x04, 0x08].includes(bytes[1])

  return isCompoundFile || isRawBiffFile
}

export async function parseSpreadsheetFile(file: File): Promise<ParsedSpreadsheet> {
  currentImport = null
  const fileType = getFileType(file.name)

  if (file.size === 0) {
    throw new ExcelImportError('empty_file')
  }

  try {
    const XLSX = await import('xlsx')
    const data = await file.arrayBuffer()

    if (!hasExpectedExcelSignature(data, fileType)) {
      throw new ExcelImportError('corrupted_file')
    }

    const workbook = XLSX.read(data, { type: 'array' })

    if (workbook.SheetNames.length === 0) {
      throw new ExcelImportError('no_worksheets')
    }

    const worksheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[worksheetName]

    if (!worksheet) {
      throw new ExcelImportError('no_worksheets')
    }

    const sheetRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: true,
    })

    const headingRowIndex = sheetRows.findIndex((row) => row.some((cell) => formatCell(cell) !== ''))

    if (headingRowIndex < 0) {
      throw new ExcelImportError('missing_headings')
    }

    const headingRow = sheetRows[headingRowIndex]
    const columns: SpreadsheetColumn[] = headingRow
      .map((cell, index) => ({ index, heading: formatCell(cell).replace(/\s+/g, ' ') }))
      .filter((column) => column.heading !== '')

    if (columns.length === 0) {
      throw new ExcelImportError('missing_headings')
    }

    const lastColumnIndex = Math.max(...columns.map((column) => column.index))
    const rows: SpreadsheetRow[] = sheetRows
      .slice(headingRowIndex + 1)
      .map((row, index) => ({
        rowNumber: headingRowIndex + index + 2,
        values: Array.from({ length: lastColumnIndex + 1 }, (_, columnIndex) => formatCell(row[columnIndex])),
      }))
      .filter((row) => row.values.some((cell) => cell !== ''))

    if (rows.length === 0) {
      throw new ExcelImportError('no_rows')
    }

    const parsedSpreadsheet: ParsedSpreadsheet = {
      fileName: file.name,
      fileType,
      worksheetName,
      columns,
      rows,
      nameColumn: detectColumn(columns, nameHeadings),
      phoneColumn: detectColumn(columns, phoneHeadings),
    }

    currentImport = parsedSpreadsheet
    return parsedSpreadsheet
  } catch (error) {
    if (error instanceof ExcelImportError) {
      throw error
    }

    throw new ExcelImportError('corrupted_file')
  }
}

export function getExcelImportErrorMessage(error: unknown): string {
  return error instanceof ExcelImportError ? error.message : errorMessages.corrupted_file
}

export function getCurrentImport(): ParsedSpreadsheet | null {
  return currentImport
}

export function setImportColumns(nameColumnIndex: number, phoneColumnIndex: number): ParsedSpreadsheet {
  if (!currentImport) {
    throw new ExcelImportError('empty_file')
  }

  const nameColumn = currentImport.columns.find((column) => column.index === nameColumnIndex)
  const phoneColumn = currentImport.columns.find((column) => column.index === phoneColumnIndex)

  if (!nameColumn || !phoneColumn) {
    throw new ExcelImportError('missing_headings')
  }

  currentImport = { ...currentImport, nameColumn, phoneColumn }
  return currentImport
}

export function getImportedContactRows(): ImportedContactRow[] {
  const importedFile = currentImport

  if (!importedFile?.nameColumn || !importedFile.phoneColumn) {
    return []
  }

  const nameColumnIndex = importedFile.nameColumn.index
  const phoneColumnIndex = importedFile.phoneColumn.index

  return importedFile.rows.map((row) => ({
    sourceRowNumber: row.rowNumber,
    name: row.values[nameColumnIndex] ?? '',
    phone: row.values[phoneColumnIndex] ?? '',
  }))
}
