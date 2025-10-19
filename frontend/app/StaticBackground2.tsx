"use client"

import { useEffect, useRef } from "react"

interface Node {
  x: number
  y: number
  type: "server" | "client"
  size: number
  opacity: number
}

interface Snake {
  segments: { x: number; y: number }[]
  vx: number
  vy: number
  targetNode: Node
  sourceNode: Node
  progress: number // 0 to 1, how far along the path
  size: number
  opacity: number
  connections: number[]
  pathPoints: { x: number; y: number }[] // Bezier curve points
  speed: number
}

export default function DynamicBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number | undefined>(undefined)
  const snakesRef = useRef<Snake[]>([])
  const nodesRef = useRef<Node[]>([])
  const spawnTimerRef = useRef<number>(0)
  const nextSpawnTimeRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const resizeCanvas = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }

    const createNodes = () => {
      const nodes: Node[] = []
      const serverCount = 12
      const clientCount = 18

      for (let i = 0; i < serverCount; i++) {
        const angle = (i / serverCount) * Math.PI * 2
        const radius = Math.min(canvas.width, canvas.height) * 0.4
        const centerX = canvas.width / 2
        const centerY = canvas.height / 2

        nodes.push({
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius,
          type: "server",
          size: 4,
          opacity: 0.8,
        })
      }

      for (let i = 0; i < clientCount; i++) {
        nodes.push({
          x: Math.random() * (canvas.width - 100) + 50,
          y: Math.random() * (canvas.height - 100) + 50,
          type: "client",
          size: 2.5,
          opacity: 0.6,
        })
      }

      nodesRef.current = nodes
    }

    const generateCurvePath = (start: Node, end: Node): { x: number; y: number }[] => {
      const points = []
      const steps = 50

      const midX = (start.x + end.x) / 2
      const midY = (start.y + end.y) / 2

      const offsetX = (Math.random() - 0.5) * 400
      const offsetY = (Math.random() - 0.5) * 400

      const controlX = midX + offsetX
      const controlY = midY + offsetY

      for (let i = 0; i <= steps; i++) {
        const t = i / steps
        const x = Math.pow(1 - t, 2) * start.x + 2 * (1 - t) * t * controlX + Math.pow(t, 2) * end.x
        const y = Math.pow(1 - t, 2) * start.y + 2 * (1 - t) * t * controlY + Math.pow(t, 2) * end.y
        points.push({ x, y })
      }

      return points
    }

    const createSnake = () => {
      const nodes = nodesRef.current
      const segmentCount = Math.floor(Math.random() * 6) + 4

      const clients = nodes.filter((n) => n.type === "client")
      const servers = nodes.filter((n) => n.type === "server")
      const sourceNode = clients[Math.floor(Math.random() * clients.length)]
      const targetNode = servers[Math.floor(Math.random() * servers.length)]

      const pathPoints = generateCurvePath(sourceNode, targetNode)

      const segments = []
      for (let j = 0; j < segmentCount; j++) {
        segments.push({
          x: sourceNode.x,
          y: sourceNode.y,
        })
      }

      const newSnake: Snake = {
        segments,
        vx: 0,
        vy: 0,
        targetNode,
        sourceNode,
        progress: 0,
        size: Math.random() * 1.2 + 0.8,
        opacity: Math.random() * 0.4 + 0.4,
        connections: [],
        pathPoints,
        speed: Math.random() * 0.0004 + 0.0008,
      }

      snakesRef.current.push(newSnake)
    }

    const initializeSnakes = () => {
      snakesRef.current = []
      for (let i = 0; i < 3; i++) {
        createSnake()
      }
    }

    const drawNode = (node: Node) => {
      ctx.beginPath()
      ctx.arc(node.x, node.y, node.size, 0, Math.PI * 2)

      if (node.type === "server") {
        ctx.fillStyle = `rgba(34, 197, 94, ${node.opacity})`
        ctx.fill()
        ctx.strokeStyle = `rgba(34, 197, 94, ${node.opacity * 0.5})`
        ctx.lineWidth = 1
        ctx.stroke()
      } else {
        ctx.fillStyle = `rgba(59, 130, 246, ${node.opacity})`
        ctx.fill()
      }
    }

    const drawSnake = (snake: Snake) => {
      const segments = snake.segments

      let fadeOpacity = 1
      if (snake.progress < 0.1) {
        fadeOpacity = snake.progress / 0.1
      } else if (snake.progress > 0.9) {
        fadeOpacity = (1 - snake.progress) / 0.1
      }

      segments.forEach((segment, index) => {
        const segmentOpacity = snake.opacity * (1 - (index / segments.length) * 0.6) * fadeOpacity
        const segmentSize = snake.size * (1 - (index / segments.length) * 0.2)

        ctx.beginPath()
        ctx.arc(segment.x, segment.y, segmentSize, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(99, 102, 241, ${segmentOpacity})`
        ctx.fill()
      })
    }

    const drawConnection = (s1: Snake, s2: Snake, distance: number) => {
      let opacity = 0.15

      const s1Fade = s1.progress < 0.1 ? s1.progress / 0.1 : s1.progress > 0.9 ? (1 - s1.progress) / 0.1 : 1
      const s2Fade = s2.progress < 0.1 ? s2.progress / 0.1 : s2.progress > 0.9 ? (1 - s2.progress) / 0.1 : 1
      opacity *= Math.min(s1Fade, s2Fade)

      const head1 = s1.segments[0]
      const head2 = s2.segments[0]

      ctx.beginPath()
      ctx.moveTo(head1.x, head1.y)
      ctx.lineTo(head2.x, head2.y)
      ctx.strokeStyle = `rgba(99, 102, 241, ${opacity})`
      ctx.lineWidth = 0.6
      ctx.stroke()
    }

    const updateSnakes = () => {
      const snakes = snakesRef.current

      spawnTimerRef.current++
      if (spawnTimerRef.current >= nextSpawnTimeRef.current && snakes.length < 15) {
        createSnake()
        spawnTimerRef.current = 0 // Reset timer after spawning
        nextSpawnTimeRef.current = Math.random() * 120 + 60 // Set next spawn time
      }

      for (let i = snakes.length - 1; i >= 0; i--) {
        const snake = snakes[i]
        snake.progress += snake.speed

        if (snake.progress >= 1) {
          snakes.splice(i, 1)
          continue
        }

        const pathIndex = snake.progress * (snake.pathPoints.length - 1)
        const lowerIndex = Math.floor(pathIndex)
        const upperIndex = Math.min(lowerIndex + 1, snake.pathPoints.length - 1)
        const t = pathIndex - lowerIndex

        const lowerPoint = snake.pathPoints[lowerIndex] || snake.pathPoints[0]
        const upperPoint = snake.pathPoints[upperIndex] || lowerPoint

        const currentPoint = {
          x: lowerPoint.x + (upperPoint.x - lowerPoint.x) * t,
          y: lowerPoint.y + (upperPoint.y - lowerPoint.y) * t,
        }

        for (let j = snake.segments.length - 1; j > 0; j--) {
          const current = snake.segments[j]
          const target = snake.segments[j - 1]

          const dx = target.x - current.x
          const dy = target.y - current.y
          const distance = Math.sqrt(dx * dx + dy * dy)

          const targetDistance = 6
          if (distance > targetDistance) {
            const moveRatio = (distance - targetDistance) / distance
            current.x += dx * moveRatio * 0.7
            current.y += dy * moveRatio * 0.7
          }
        }

        snake.segments[0].x = currentPoint.x
        snake.segments[0].y = currentPoint.y

        snake.connections = []
        for (let j = i + 1; j < snakes.length; j++) {
          const other = snakes[j]
          if (snake.targetNode === other.targetNode) {
            snake.connections.push(j)
          }
        }
      }
    }

    const animate = () => {
      const canvas = canvasRef.current
      if (!canvas) return

      const ctx = canvas.getContext("2d")
      if (!ctx) return

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      updateSnakes()

      const snakes = snakesRef.current
      const nodes = nodesRef.current

      snakes.forEach((snake, i) => {
        snake.connections.forEach((connectionIndex) => {
          const other = snakes[connectionIndex]
          if (other && other.segments && other.segments.length > 0) {
            const head1 = snake.segments[0]
            const head2 = other.segments[0]
            const dx = head1.x - head2.x
            const dy = head1.y - head2.y
            const distance = Math.sqrt(dx * dx + dy * dy)
            drawConnection(snake, other, distance)
          }
        })
      })

      snakes.forEach(drawSnake)

      animationRef.current = requestAnimationFrame(animate)
    }

    resizeCanvas()
    createNodes()
    initializeSnakes()
    animate()

    const handleResize = () => {
      resizeCanvas()
      createNodes()
      initializeSnakes()
    }

    window.addEventListener("resize", handleResize)

    return () => {
      window.removeEventListener("resize", handleResize)
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [])

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ background: "transparent", filter: "blur(1px)" }}
      />
     <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.2] via-accent/[0.2] to-chart-2/[0.2]" />
    </div>
  )
}
