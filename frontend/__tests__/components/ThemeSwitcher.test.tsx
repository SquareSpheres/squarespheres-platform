import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeSwitcher } from '../../app/components/ThemeSwitcher'

// Mock next-themes with a more detailed implementation
const mockSetTheme = jest.fn()
const mockUseTheme = jest.fn()

jest.mock('next-themes', () => ({
  useTheme: () => mockUseTheme(),
}))

describe('ThemeSwitcher', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders the theme switcher button', () => {
    mockUseTheme.mockReturnValue({
      theme: 'light',
      setTheme: mockSetTheme,
      resolvedTheme: 'light',
    })

    render(<ThemeSwitcher />)
    
    const button = screen.getByRole('button')
    expect(button).toBeInTheDocument()
    expect(button).toHaveAttribute('title', 'Switch to dark mode')
  })

  it('shows light mode icon when in dark theme', () => {
    mockUseTheme.mockReturnValue({
      theme: 'dark',
      setTheme: mockSetTheme,
      resolvedTheme: 'dark',
    })

    render(<ThemeSwitcher />)
    
    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('title', 'Switch to light mode')
  })

  it('calls setTheme when clicked', () => {
    mockUseTheme.mockReturnValue({
      theme: 'light',
      setTheme: mockSetTheme,
      resolvedTheme: 'light',
    })

    render(<ThemeSwitcher />)
    
    const button = screen.getByRole('button')
    fireEvent.click(button)
    
    expect(mockSetTheme).toHaveBeenCalledWith('dark')
  })

  it('switches from dark to light when clicked', () => {
    mockUseTheme.mockReturnValue({
      theme: 'dark',
      setTheme: mockSetTheme,
      resolvedTheme: 'dark',
    })

    render(<ThemeSwitcher />)
    
    const button = screen.getByRole('button')
    fireEvent.click(button)
    
    expect(mockSetTheme).toHaveBeenCalledWith('light')
  })

})
