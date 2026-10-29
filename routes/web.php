<?php

use App\Models\Conversation;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::inertia('/', 'welcome')->name('home');

Route::middleware(['auth', 'verified'])->group(function () {
    Route::inertia('dashboard', 'dashboard')->name('dashboard');
});

Route::middleware('auth')->get('/chat', function () {
    return Inertia::render('chat', [
        'conversationId' => null,
        'currentUserId' => auth()->id(),
        'otherUser' => null,
    ]);
});

Route::middleware('auth')->get(
    '/chat/{conversation}',
    function (Conversation $conversation) {
        abort_unless(
            $conversation->users()
                ->whereKey(auth()->id())
                ->exists(),
            403
        );

        $otherUser = $conversation->users()
            ->whereKeyNot(auth()->id())
            ->first(['users.id', 'users.name']);

        return Inertia::render('chat', [
            'conversationId' => $conversation->id,
            'currentUserId' => auth()->id(),
            'otherUser' => $otherUser?->only(['id', 'name']),
        ]);
    }
);

require __DIR__.'/settings.php';
