/**
 * Admin — redirects to the live dashboard.
 *
 * Winner selection and ceremony management have moved to the Winners tab
 * inside Live.tsx. This route is kept for URL backward compatibility.
 */

import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

export default function Admin() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()

  useEffect(() => {
    navigate(`/room/${code}/live`, { replace: true })
  }, [code, navigate])

  return null
}
