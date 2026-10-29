<?php

use App\Http\Controllers\Api\ChatController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/chat/users', [ChatController::class, 'users']);
    Route::get('/conversations', [ChatController::class, 'index']);
    Route::post('/conversations', [ChatController::class, 'start']);

    Route::get(
        '/conversations/{conversation}/messages',
        [ChatController::class, 'messages']
    );

    Route::post(
        '/conversations/{conversation}/messages',
        [ChatController::class, 'send']
    );

    Route::post(
        '/conversations/{conversation}/read',
        [ChatController::class, 'read']
    );
});
