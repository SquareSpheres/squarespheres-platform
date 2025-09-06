'use client'

import { motion } from 'framer-motion'
import { UploadCloud } from 'lucide-react'

interface FileDropAnimationProps {
  isDragging: boolean
}

export default function FileDropAnimation({ isDragging }: FileDropAnimationProps) {
  return (
    <div className="relative w-48 h-48 mx-auto -mb-8">
      <motion.div
        animate={{
          y: isDragging ? -15 : 0,
          scale: isDragging ? 1.1 : 1,
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 10 }}
        className="absolute inset-0 flex items-center justify-center"
      >
        <UploadCloud
          className={`h-24 w-24 transition-colors duration-300 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`}
        />
      </motion.div>
    </div>
  )
} 