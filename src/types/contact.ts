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

export type ExcelImportErrorCode =
  | 'unsupported_file'
  | 'empty_file'
  | 'no_worksheets'
  | 'missing_headings'
  | 'no_rows'
  | 'corrupted_file'
