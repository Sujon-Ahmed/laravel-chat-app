import { Form, Head, Link, usePage } from '@inertiajs/react';
import { Mail, ShieldCheck } from 'lucide-react';
import ProfileController from '@/actions/App/Http/Controllers/Settings/ProfileController';
import DeleteUser from '@/components/delete-user';
import InputError from '@/components/input-error';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { initials } from '@/lib/utils';
import { edit } from '@/routes/profile';
import { send } from '@/routes/verification';
import type { Auth } from '@/types';

type PageProps = {
    auth: Auth;
};

export default function Profile({
    mustVerifyEmail,
    status,
}: {
    mustVerifyEmail: boolean;
    status?: string;
}) {
    const { auth } = usePage<PageProps>().props;
    const user = auth.user;
    const isVerified = user.email_verified_at !== null;

    return (
        <>
            <Head title="Profile settings" />

            <h1 className="sr-only">Profile settings</h1>

            <div className="space-y-6">
                <div className="space-y-1">
                    <h2 className="text-lg font-semibold tracking-tight">
                        Profile
                    </h2>

                    <p className="text-sm text-muted-foreground">
                        Manage your account details and how you appear in
                        conversations.
                    </p>
                </div>

                <Card className="p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                        <Avatar className="size-16">
                            {user.avatar && (
                                <AvatarImage
                                    src={user.avatar}
                                    alt={user.name}
                                />
                            )}

                            <AvatarFallback className="text-lg font-medium">
                                {initials(user.name)}
                            </AvatarFallback>
                        </Avatar>

                        <div className="min-w-0 flex-1 space-y-1">
                            <p className="truncate text-base leading-none font-medium">
                                {user.name}
                            </p>

                            <p className="truncate text-sm text-muted-foreground">
                                {user.email}
                            </p>
                        </div>

                        <Badge
                            variant={isVerified ? 'secondary' : 'outline'}
                            className="gap-1.5 self-start sm:self-auto"
                        >
                            {isVerified ? (
                                <ShieldCheck className="size-3" />
                            ) : (
                                <Mail className="size-3" />
                            )}

                            {isVerified ? 'Verified' : 'Unverified'}
                        </Badge>
                    </div>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">
                            Account details
                        </CardTitle>

                        <CardDescription>
                            Update your name and the email address you sign in
                            with.
                        </CardDescription>
                    </CardHeader>

                    <CardContent>
                        <Form
                            {...ProfileController.update.form()}
                            options={{
                                preserveScroll: true,
                            }}
                            className="space-y-6"
                        >
                            {({ processing, errors }) => (
                                <>
                                    <div className="grid gap-2">
                                        <Label htmlFor="name">Name</Label>

                                        <Input
                                            id="name"
                                            className="mt-1 block w-full"
                                            defaultValue={user.name}
                                            name="name"
                                            required
                                            autoComplete="name"
                                            placeholder="Full name"
                                        />

                                        <InputError
                                            className="mt-2"
                                            message={errors.name}
                                        />
                                    </div>

                                    <div className="grid gap-2">
                                        <Label htmlFor="email">
                                            Email address
                                        </Label>

                                        <Input
                                            id="email"
                                            type="email"
                                            className="mt-1 block w-full"
                                            defaultValue={user.email}
                                            name="email"
                                            required
                                            autoComplete="username"
                                            placeholder="Email address"
                                        />

                                        <InputError
                                            className="mt-2"
                                            message={errors.email}
                                        />
                                    </div>

                                    {mustVerifyEmail &&
                                        user.email_verified_at === null && (
                                            <div className="rounded-lg border bg-muted/40 p-4">
                                                <p className="text-sm text-muted-foreground">
                                                    Your email address is
                                                    unverified.{' '}
                                                    <Link
                                                        href={send()}
                                                        as="button"
                                                        className="font-medium text-foreground underline decoration-neutral-300 underline-offset-4 transition-colors duration-300 ease-out hover:decoration-current! dark:decoration-neutral-500"
                                                    >
                                                        Click here to re-send
                                                        the verification email.
                                                    </Link>
                                                </p>

                                                {status ===
                                                    'verification-link-sent' && (
                                                    <p className="mt-2 text-sm font-medium text-green-600 dark:text-green-400">
                                                        A new verification link
                                                        has been sent to your
                                                        email address.
                                                    </p>
                                                )}
                                            </div>
                                        )}

                                    <div className="flex items-center gap-3">
                                        <Button
                                            disabled={processing}
                                            data-test="update-profile-button"
                                        >
                                            Save changes
                                        </Button>

                                        {processing && (
                                            <span className="text-xs text-muted-foreground">
                                                Saving…
                                            </span>
                                        )}
                                    </div>
                                </>
                            )}
                        </Form>
                    </CardContent>
                </Card>

                <DeleteUser />
            </div>
        </>
    );
}

Profile.layout = {
    breadcrumbs: [
        {
            title: 'Profile settings',
            href: edit(),
        },
    ],
};
