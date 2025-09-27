import { formatFileSize } from '../../app/utils/formatFileSize'

describe('formatFileSize', () => {
  it('formats bytes correctly', () => {
    expect(formatFileSize(0)).toBe('0 Bytes')
    expect(formatFileSize(500)).toBe('500 Bytes')
    expect(formatFileSize(1023)).toBe('1023 Bytes')
  })

  it('formats kilobytes correctly', () => {
    expect(formatFileSize(1024)).toBe('1 KB')
    expect(formatFileSize(1536)).toBe('1.5 KB')
    expect(formatFileSize(2048)).toBe('2 KB')
  })

  it('formats megabytes correctly', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1 MB')
    expect(formatFileSize(1024 * 1024 * 1.5)).toBe('1.5 MB')
    expect(formatFileSize(1024 * 1024 * 2)).toBe('2 MB')
  })

  it('formats gigabytes correctly', () => {
    expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB')
    expect(formatFileSize(1024 * 1024 * 1024 * 1.5)).toBe('1.5 GB')
    expect(formatFileSize(1024 * 1024 * 1024 * 2)).toBe('2 GB')
  })

  it('handles large numbers', () => {
    expect(formatFileSize(1024 * 1024 * 1024 * 1024)).toBe('1 TB')
  })
})
