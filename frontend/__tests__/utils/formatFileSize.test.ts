import { formatFileSize } from '../../app/utils/formatFileSize'

describe('formatFileSize', () => {
  it('formats zero bytes correctly', () => {
    expect(formatFileSize(0)).toBe('0 Bytes')
  })

  it('formats bytes correctly', () => {
    expect(formatFileSize(500)).toBe('500 Bytes')
  })

  it('formats kilobytes correctly', () => {
    expect(formatFileSize(1024)).toBe('1 KB')
    expect(formatFileSize(1536)).toBe('1.5 KB')
  })

  it('formats megabytes correctly', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1 MB')
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2.5 MB')
  })

  it('formats gigabytes correctly', () => {
    expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB')
    expect(formatFileSize(1.5 * 1024 * 1024 * 1024)).toBe('1.5 GB')
  })

  it('formats large files correctly', () => {
    expect(formatFileSize(5 * 1024 * 1024 * 1024 * 1024)).toBe('5 TB')
  })

  it('rounds to 2 decimal places', () => {
    expect(formatFileSize(1024 + 512)).toBe('1.5 KB')
    expect(formatFileSize(1024 + 256)).toBe('1.25 KB')
  })
})
