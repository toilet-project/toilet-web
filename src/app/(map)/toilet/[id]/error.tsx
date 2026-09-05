'use client'

import { MapRouteFailure } from '../../../../components/MapRouteFailure'

export default function ToiletError({ reset }: { reset: () => void }) { return <MapRouteFailure retry={reset} /> }
