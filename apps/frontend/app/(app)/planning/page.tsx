'use client';

import { useState } from 'react';
import { CreateRecommendationForm } from '@/components/planning/create-recommendation-form';
import { RankingTable } from '@/components/planning/ranking-table';
import { RecommendationList } from '@/components/planning/recommendation-list';
import type { RankingRow } from '@/lib/planning';

export default function PlanningPage() {
  const [creatingFor, setCreatingFor] = useState<RankingRow | null>(null);
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Purchase Planning</h1>
      {creatingFor && <CreateRecommendationForm key={creatingFor.itemId} item={creatingFor} onClose={() => setCreatingFor(null)} />}
      <RankingTable onCreate={setCreatingFor} />
      <RecommendationList />
    </div>
  );
}
