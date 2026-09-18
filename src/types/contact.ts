export type Contact = {
  id: string
  name: string
  email?: string
  phone?: string
}

export type SpreadsheetFileType = 'xlsx' | 'xls' | 'csv'

export type SpreadsheetColumn = {
  index: number
  heading: string
}

export type SpreadsheetRow = {
  rowNumber: number
  values: string[]
}

export type ParsedSpreadsheet = {
  fileName: string
  fileType: SpreadsheetFileType
  worksheetName: string
  columns: SpreadsheetColumn[]
  rows: SpreadsheetRow[]
  nameColumn: SpreadsheetColumn | null
  phoneColumn: SpreadsheetColumn | null
}

export type ImportedContactRow = {
  sourceRowNumber: number
  name: string
  phone: string
}

export type ProcessedContactStatus = 'new' | 'duplicate' | 'invalid'

export type ProcessedContact = {
  id: string
  name: string
  originalName: string
  originalNameWasEmpty: boolean
  phone: string
  originalPhone: string
  normalizedPhone: string
  status: ProcessedContactStatus
  isValid: boolean
  validationMessage: string | null
  duplicateOf: string | null
  rowNumber: number
  saveDisplayName: string | null
}

export type ContactSummary = {
  total: number
  newCount: number
  duplicateCount: number
  invalidCount: number
}

export type ContactEdit = {
  name: string
  phone: string
}

export type ExcelImportErrorCode =
  | 'unsupported_file'
  | 'empty_file'
  | 'no_worksheets'
  | 'missing_headings'
  | 'no_rows'
  | 'corrupted_file'
