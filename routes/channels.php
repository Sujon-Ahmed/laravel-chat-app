
<?php

use App\Models\Conversation;
use App\Models\User;
use Illuminate\Support\Facades\Broadcast;

Broadcast::channel(
    'user.{userId}',
    fn (User $user, int $userId) => $user->id === $userId
);

Broadcast::channel(
    'conversation.{conversationId}',
    function (User $user, int $conversationId) {
        return Conversation::query()
            ->whereKey($conversationId)
            ->whereHas(
                'users',
                fn ($query) => $query->whereKey($user->id)
            )
            ->exists();
    }
);
